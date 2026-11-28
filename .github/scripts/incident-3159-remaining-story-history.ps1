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
for number,parent_id,output_id,expected,after,before,held in [
 (11250,"recAdiURMeoS8VJnJ","recDH1TiBHlR3kJ85","9362a08d77676c85b03fb4d40e2c0f5ae68b8e465216dc57d7384f5a0551e9f3","2026-11-25T02:02:00Z","2026-11-28T00:00:00Z",True),
 (11388,"rec2XJdAZlS3N8hbE","recSxK5fHXrgZrRJd","c611f5ecef231d8bc4825ddb194e121fbf968bb189b18e692763da4ef17ad388","2026-11-25T21:19:00Z","2026-11-28T00:00:00Z",False),
 (11390,"reczNIelMId8KIXzx","recfQVgsrRx9PcKVx","3590a626f7bd7fa9ddd186025201359f5dccf0e1d746e2a230de7b9bb98bea0e","2026-11-25T23:12:00Z","2026-11-28T00:00:00Z",False),
 (11398,"rec4dPzGEJe0WbZpv","recaDcFyRPHitve7Y","bb409f7bd0965cdbe7c6db32d70f6429ff5b8ce9473085546d6d5d77e7557aee","2026-11-26T05:38:00Z","2026-11-28T00:00:00Z",False),
 (11404,"rec8vqR7UnviPMoH7","recGWbCjBIVt7B7nG","aab9bf8503392847c34bc90bdc5c61b1d39e764fd6bf55e364026b8aa331089a","2026-11-26T05:44:00Z","2026-11-28T00:00:00Z",False)]:
 result={"output":number,"status":"unverified"}
 try:
  o=row("platform_outputs",{"output_number":"eq."+str(number),"select":"airtable_record_id,output_status,render_status,do_not_publish,auto_publish_enabled,production_approved_at,published_at,render_total_frames,selected_assets,error_messages"})
  p=row("content_items",{"airtable_record_id":"eq."+parent_id,"select":"airtable_record_id,extras"})
  receipt=o["error_messages"]["Studio_Story_Voiceover_Receipt_JSON"]
  for _ in range(3):
   if isinstance(receipt,str): receipt=json.loads(receipt)
  if not isinstance(receipt,dict): raise ValueError("receipt_invalid")
  if (o["airtable_record_id"]!=output_id or o["output_status"]!="In Production" or o["render_status"]!="Blocked" or o["do_not_publish"] is not held or o["auto_publish_enabled"] not in (None,False) or o["published_at"] or receipt.get("state")!="failed" or receipt.get("sha256") or receipt.get("fingerprint")!=expected): raise ValueError("revision_changed")
  extras=p["extras"]
  text=next(" ".join(x.split()) for x in re.findall(r".+?[.!?]+(?=\s|$)",extras["Voiceover_Script"].strip(),flags=re.S) if 3<=len(x.split())<=20)
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
  result["production_approval_present"]=bool(o["production_approved_at"])
  result["matches"]=len(matched)
  if more is not False: result["status"]="history_incomplete"
  elif len(matched)!=1:
   result["status"]="no_exact_history" if not matched else "ambiguous_history"
   # Report bounded candidates, without provider IDs or narration bytes.
   # A matching text/voice alone cannot authorize reuse.
   if 1<len(matched)<=4:
    candidates=[]
    for item_id,item in matched.items():
     data=get("https://api.elevenlabs.io/v1/history/"+item_id+"/audio",{"xi-api-key":el,"Accept":"audio/mpeg"},bound=8388608)
     if len(data)<32: raise ValueError("empty_audio")
     candidates.append({"created_at":int(item["date_unix"]),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
    result["candidates"]=sorted(candidates,key=lambda x:(x["created_at"],x["sha256"]))
  else:
   item_id=next(iter(matched))
   data=get("https://api.elevenlabs.io/v1/history/"+item_id+"/audio",{"xi-api-key":el,"Accept":"audio/mpeg"},bound=8388608)
   if len(data)<32: raise ValueError("empty_audio")
   result.update(status="unique_original_download_verified",bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),created_at=matched[item_id]["date_unix"])
 except urllib.error.HTTPError as exc: result["status"]="http_"+str(exc.code)
 except Exception as exc: result["status"]="identity_or_read_unverified"
 print("story3159_remaining_history="+json.dumps(result,separators=(",",":")))
print("story3159_remaining_history_proof=PASS_READONLY")
'@
$lines=$code | & python -
if($LASTEXITCODE -ne 0){throw 'story_history_python_failed'}
$lines
}finally{
Remove-Item Env:STORY_PROBE_SB,Env:STORY_PROBE_KEY,Env:STORY_PROBE_EL -ErrorAction SilentlyContinue
}
