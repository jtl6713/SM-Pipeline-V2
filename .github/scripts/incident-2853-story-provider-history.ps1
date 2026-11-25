$ErrorActionPreference='Stop'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
function Read-Setting([string]$name){
  $line=Get-Content -LiteralPath $envPath | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1
  if(-not $line){throw 'story_history_setting_missing'}
  return ([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
}
try{
$env:STORY_PROBE_SB=Read-Setting 'SUPABASE_URL'
if($env:STORY_PROBE_SB.TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'unexpected_project'}
$env:STORY_PROBE_KEY=Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$env:STORY_PROBE_EL=Read-Setting 'ELEVENLABS_API_KEY'
$code=@'
import os,json,re,hashlib,urllib.request,urllib.parse,urllib.error,datetime
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(NoRedirect())
sb=os.environ["STORY_PROBE_SB"].rstrip("/")
key=os.environ["STORY_PROBE_KEY"]
el=os.environ["STORY_PROBE_EL"]
def get(url,headers,params=None,bound=1048576):
 if params: url+="?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers=headers)
 with opener.open(req,timeout=20) as r:
  data=r.read(bound+1)
  if len(data)>bound: raise ValueError("response_bound")
  return data
def row(table,params):
 params={**params,"limit":2}
 result=json.loads(get(sb+"/rest/v1/"+table,{"apikey":key,"Authorization":"Bearer "+key},params))
 if not isinstance(result,list) or len(result)!=1: raise ValueError("row_identity")
 return result[0]
def epoch(s): return int(datetime.datetime.fromisoformat(s.replace("Z","+00:00")).timestamp())
for number,parent_id,output_id,expected,after,before in [
 (11202,"reccVyNLdmJJeI8hG","recjqFCCxBroLyoQJ","b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260","2026-11-25T01:45:14Z","2026-11-25T06:50:17Z"),
 (11234,"recG0b34XYwYWggTp","rec72bKqmIjLMs1gI","69e65eb8a0e00385ba952c8bfee7926fa8b6c6bc3562c2a3909e07718df71147","2026-11-25T02:11:55Z","2026-11-25T10:41:22Z")]:
 result={"output":number,"status":"unverified"}
 try:
  o=row("platform_outputs",{"output_number":"eq."+str(number),"select":"airtable_record_id,output_status,render_status,do_not_publish,auto_publish_enabled,production_approved_at,published_at,render_total_frames,selected_assets,error_messages"})
  p=row("content_items",{"airtable_record_id":"eq."+parent_id,"select":"airtable_record_id,extras"})
  receipt=json.loads(o["error_messages"]["Studio_Story_Voiceover_Receipt_JSON"])
  if (o["airtable_record_id"]!=output_id or o["output_status"]!="In Production" or o["render_status"]!="Blocked" or not o["do_not_publish"] or o["auto_publish_enabled"] is not False or o["production_approved_at"] or o["published_at"] or receipt.get("state")!="failed" or receipt.get("sha256") or receipt.get("fingerprint")!=expected): raise ValueError("revision_changed")
  extras=p["extras"]
  text=next(" ".join(x.split()) for x in re.findall(r"[^.!?]+[.!?]+",extras["Voiceover_Script"].strip()) if 3<=len(x.split())<=20)
  voice=extras["Voice_ID"]
  cap=int((o["selected_assets"] or {}).get("target_total_frames") or o["render_total_frames"])/30
  digest=hashlib.sha256(json.dumps([parent_id,voice,text,cap],separators=(",",":")).encode()).hexdigest()
  if digest!=expected or receipt.get("url")!="https://media.chicagoshining.com/studio/previews/story-voiceover/"+parent_id+"/"+digest+".mp3": raise ValueError("fingerprint_changed")
  params={"voice_id":voice,"model_id":"eleven_multilingual_v2","source":"TTS","search":text,"date_after_unix":epoch(after),"date_before_unix":epoch(before),"page_size":50}
  matched={}
  more=True
  for _ in range(2):
   page=json.loads(get("https://api.elevenlabs.io/v1/history",{"xi-api-key":el,"Accept":"application/json"},params))
   for item in page.get("history",[]):
    if item.get("text")==text and item.get("voice_id")==voice and item.get("model_id")=="eleven_multilingual_v2" and item.get("source")=="TTS" and epoch(after)<=int(item.get("date_unix",0))<epoch(before):
     item_id=item.get("history_item_id","")
     if re.fullmatch(r"[A-Za-z0-9_-]{8,128}",item_id): matched[item_id]=item
   more=page.get("has_more")
   if more is False: break
   cursor=page.get("last_history_item_id")
   if not cursor or cursor==params.get("start_after_history_item_id"): break
   params["start_after_history_item_id"]=cursor
  result["matches"]=len(matched)
  if more is not False: result["status"]="history_incomplete"
  elif len(matched)!=1: result["status"]="no_exact_history" if not matched else "ambiguous_history"
  else:
   item_id=next(iter(matched))
   data=get("https://api.elevenlabs.io/v1/history/"+item_id+"/audio",{"xi-api-key":el,"Accept":"audio/mpeg"},bound=8388608)
   if len(data)<32: raise ValueError("empty_audio")
   result.update(status="unique_original_download_verified",bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),created_at=matched[item_id]["date_unix"])
 except urllib.error.HTTPError as exc: result["status"]="http_"+str(exc.code)
 except Exception as exc: result["status"]="identity_or_read_unverified"
 print("story2853_history="+json.dumps(result,separators=(",",":")))
print("story2853_history_proof=PASS_READONLY")
'@
$lines=$code | & python -
if($LASTEXITCODE -ne 0){throw 'story_history_python_failed'}
$lines
}finally{
Remove-Item Env:STORY_PROBE_SB,Env:STORY_PROBE_KEY,Env:STORY_PROBE_EL -ErrorAction SilentlyContinue
}
