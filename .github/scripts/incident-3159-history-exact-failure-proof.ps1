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
import subprocess,tempfile
from pathlib import Path
for number,parent_id,output_id,expected,ts,raw_sha in [
 (11202,"reccVyNLdmJJeI8hG","recjqFCCxBroLyoQJ","b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260",1795576594,"9977a3100b5ede15666c69ea061aafb25054221e9ceb6a345d319a5c0d23bd05"),
 (11234,"recG0b34XYwYWggTp","rec72bKqmIjLMs1gI","69e65eb8a0e00385ba952c8bfee7926fa8b6c6bc3562c2a3909e07718df71147",1795590254,"7776de868a7f8d7f0ee6cbb844275e7e5d7f54409ddd2048d6ea7f9f461a42aa")]:
 result={"output":number,"status":"unverified","phase":"canonical"}
 try:
  o=row("platform_outputs",{"output_number":"eq."+str(number),"select":"airtable_record_id,output_status,render_status,do_not_publish,auto_publish_enabled,production_approved_at,published_at,render_total_frames,selected_assets,error_messages"})
  p=row("content_items",{"airtable_record_id":"eq."+parent_id,"select":"airtable_record_id,extras"})
  receipt=o["error_messages"]["Studio_Story_Voiceover_Receipt_JSON"]
  for _ in range(3):
   if isinstance(receipt,str): receipt=json.loads(receipt)
  if (o["airtable_record_id"]!=output_id or o["output_status"]!="In Production" or o["render_status"]!="Blocked" or o["do_not_publish"] is not True or o["auto_publish_enabled"] is not False or o["production_approved_at"] or o["published_at"] or receipt.get("state")!="failed" or receipt.get("sha256") or receipt.get("fingerprint")!=expected): raise ValueError("revision_changed")
  extras=p["extras"]
  text=next(" ".join(x.split()) for x in re.findall(r".+?[.!?]+(?=\s|$)",extras["Voiceover_Script"].strip(),flags=re.S) if 3<=len(x.split())<=20)
  voice=extras["Voice_ID"]
  cap=int((o["selected_assets"] or {}).get("target_total_frames") or o["render_total_frames"])/30
  digest=hashlib.sha256(json.dumps([parent_id,voice,text,cap],separators=(",",":")).encode()).hexdigest()
  if digest!=expected or receipt.get("url")!="https://media.chicagoshining.com/studio/previews/story-voiceover/"+parent_id+"/"+digest+".mp3":raise ValueError("fingerprint_changed")
  result["phase"]="history"
  headers={"xi-api-key":el,"Accept":"application/json"}
  matched={}
  for label,delta in (("deployed",0),("padded",1)):
   params={"voice_id":voice,"model_id":"eleven_multilingual_v2","source":"TTS","search":text,"date_after_unix":ts-delta,"date_before_unix":ts+1,"page_size":20}
   page=json.loads(get("https://api.elevenlabs.io/v1/history",headers,params))
   items={x["history_item_id"]:x for x in page.get("history",[]) if x.get("text")==text and x.get("voice_id")==voice and x.get("model_id")=="eleven_multilingual_v2" and x.get("source")=="TTS" and x.get("date_unix")==ts and re.fullmatch(r"[A-Za-z0-9_-]{8,128}",x.get("history_item_id",""))}
   result[label]={"matches":len(items),"complete":page.get("has_more") is False}
   if page.get("has_more") is False and len(items)==1:matched.update(items)
  if len(matched)!=1:raise ValueError("no_unique_history")
  result["phase"]="raw_bytes"
  data=get("https://api.elevenlabs.io/v1/history/"+next(iter(matched))+"/audio",{"xi-api-key":el,"Accept":"audio/mpeg"},bound=8388608)
  result["bytes"]=len(data)
  result["raw_sha_match"]=hashlib.sha256(data).hexdigest()==raw_sha
  if not result["raw_sha_match"]:raise ValueError("original_checksum_changed")
  result["phase"]="raw_media"
  with tempfile.TemporaryDirectory(prefix="3159-history-read-") as tmp:
   path=Path(tmp)/"original.mp3";path.write_bytes(data)
   duration=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",str(path)],timeout=20))
   proc=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(path),"-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=30)
   peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",proc.stderr)
   result.update(duration=duration,peak_db=float(peak.group(1)) if peak else None,decode_ok=proc.returncode==0,raw_duration_contract=2<=duration<=cap-0.1)
  result["status"]="original_bytes_verified"
 except urllib.error.HTTPError as exc:result["status"]="http_"+str(exc.code)
 except Exception as exc:result["status"]=str(exc) if isinstance(exc,ValueError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__
 print("story3159_history="+json.dumps(result,separators=(",",":")))
print("story3159_history_proof=PASS_READONLY")
'@
$lines=$code | & python -
if($LASTEXITCODE -ne 0){throw 'story_history_python_failed'}
$lines
}finally{
Remove-Item Env:STORY_PROBE_SB,Env:STORY_PROBE_KEY,Env:STORY_PROBE_EL -ErrorAction SilentlyContinue
}
