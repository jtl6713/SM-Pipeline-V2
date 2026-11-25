$ErrorActionPreference='Stop'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
function Read-Setting([string]$name){
 $line=Get-Content -LiteralPath $envPath | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1
 if(-not $line){throw 'resume_setting_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
}
try{
$env:STORY_RESUME_SB=Read-Setting 'SUPABASE_URL'
if($env:STORY_RESUME_SB.TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'unexpected_project'}
$env:STORY_RESUME_KEY=Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$env:STORY_RESUME_RUNNER=Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$env:STORY_RESUME_DB=Read-Setting 'STUDIO_GOVERNOR_DB_PATH'
$env:STORY_RESUME_ROOT=Split-Path -Parent $envPath
$code=@'
import os,json,hashlib,urllib.request,urllib.parse,urllib.error,sqlite3
from pathlib import Path
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k): return None
opener=urllib.request.build_opener(NoRedirect())
base=os.environ["STORY_RESUME_SB"].rstrip("/")
key=os.environ["STORY_RESUME_KEY"]
auth={"X-Pipeline-Secret":os.environ["STORY_RESUME_RUNNER"]}
local="http://127.0.0.1:3350"
def get(url,headers=None,params=None,body=None,bound=1048576):
 if params: url+="?"+urllib.parse.urlencode(params)
 data=None if body is None else json.dumps(body).encode()
 h=dict(headers or {})
 if data is not None: h["Content-Type"]="application/json"
 with opener.open(urllib.request.Request(url,data=data,headers=h),timeout=30) as r:
  b=r.read(bound+1)
  if len(b)>bound: raise ValueError("response_bound")
  return b
def rest(table,params):
 return json.loads(get(base+"/rest/v1/"+table,{"apikey":key,"Authorization":"Bearer "+key},params))
def one(table,params):
 a=rest(table,{**params,"limit":2})
 if len(a)!=1: raise ValueError("identity")
 return a[0]
def queue(rid):
 db=sqlite3.connect(Path(os.environ["STORY_RESUME_DB"]).resolve().as_uri()+"?mode=ro",uri=True,timeout=3)
 try:
  r=db.execute("SELECT state,consecutive_yields FROM producer_jobs WHERE request_id=?",(rid,)).fetchone()
  return tuple(r) if r else (None,None)
 finally: db.close()
def work():
 h=json.loads(get(local+"/health"))
 w=json.loads(get(local+"/admin/workload",auth))
 if not (h.get("ok") and h.get("studio_write_source")=="supabase" and h.get("supabase_pipeline_writes") is True and h.get("workload_governor_enabled") is True and h.get("i1_durable_jobs") is True and h.get("recovery_read_only") is False and w.get("ok") and w.get("enabled") and w.get("database_circuit_phase")=="closed" and w.get("max_jobs")==1 and not w.get("admission_paused") and not w.get("smv1_maintenance_active")): raise ValueError("admission_gate")
 root=Path(os.environ["STORY_RESUME_ROOT"])
 if "download_audited_history" not in (root/"studio_produce"/"story_voiceover.py").read_text(encoding="utf-8"): raise ValueError("history_runtime_not_installed")
 return w
cohort=[
 ("ZOC78Q","recEDPsqJlxaGHCyO","rec9qS53G7HDoyCL5",11196,11197,"0454c4863049a512c784d2964e74a587387baa5665a2753a1bb8f5b3c501c18d","e6d305b08797e5c83f5ee30104384e702573cfe0d352a8a078f6eee6df1982fb"),
 ("MCUBYN","recSUWvM0cPlqDp3c","rec1IvSP9aGeOQRfd",11220,11221,"c794387245520b188bb45588addeb137cf4cc6237e5d7d2324b476f6b90ebfaa","bc89fc89aa041a774362fb8d29ec23ccfa7051fc4f9de045847164ef5a2b1b63"),
 ("AR5WQW","reco2F1U70vWW5g7G","rec3fNJ6QgaL7EMBn",11214,11215,"f1a4382db6a08f1f5591a61a768420b93d9f6d01c52b3aa337fc197147350a58","3d3cb59ea7a0d6512663607773464d59f003d6cd7af96f7adf3e54469cab72f5"),
 ("5ANT57","rec9iM9aQBPhA1e2q","reccVyNLdmJJeI8hG",11202,11203,"b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260",None),
 ("HVCN09","recuuGJr8rUO5ZV4r","recG0b34XYwYWggTp",11234,11235,"69e65eb8a0e00385ba952c8bfee7926fa8b6c6bc3562c2a3909e07718df71147",None)]
for suffix,rid,pid,a,b,digest,sha in cohort:
 result={"request":suffix,"status":"not_resumed"}
 try:
  state,yields=queue(rid)
  if state!="paused" or yields!=8:
   result.update(status="not_parked_no_submit",queue_state=state)
  else:
   work()
   r=one("production_requests",{"airtable_record_id":"eq."+rid,"select":"production_request_id,production_job,request_status,publish_status,promoted_content_item_id"})
   p=one("content_items",{"airtable_record_id":"eq."+pid,"select":"id,airtable_record_id"})
   if not (r["production_request_id"].endswith("-"+suffix) and r["request_status"] in ("Promoted","Submitted") and (r["production_job"] or {}).get("step")=="render" and not (r["publish_status"] or {}).get("Test_Run_ID") and str(r["promoted_content_item_id"]) in (str(p["id"]),pid)): raise ValueError("parent_gate")
   rows=rest("platform_outputs",{"content_item_id":"eq."+str(p["id"]),"select":"output_number,output_status,render_status,do_not_publish,auto_publish_enabled,review_status,production_approved_at,published_at,studio_scheduled_at,youtube_scheduled_publish_at,remotion_job_id,final_file_url,platform_publish_response,error_messages","limit":7})
   if len(rows)!=6 or sum(x["render_status"]=="Rendered" and bool(x["final_file_url"]) for x in rows)!=4: raise ValueError("cohort_gate")
   pair={x["output_number"]:x for x in rows if x["output_number"] in (a,b)}
   if set(pair)!={a,b}: raise ValueError("pair_gate")
   for x in pair.values():
    err=(x["error_messages"] or {}).get("Remotion_Error_Message","")
    if not (x["output_status"]=="In Production" and x["render_status"]=="Blocked" and x["do_not_publish"] is True and x["auto_publish_enabled"] is False and x["review_status"] in (None,"","Pending Review","Review Sent") and err in ("Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt","Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation") and not any(x[k] for k in ("production_approved_at","published_at","studio_scheduled_at","youtube_scheduled_publish_at","remotion_job_id","final_file_url","platform_publish_response"))): raise ValueError("output_gate")
   receipt=json.loads(pair[a]["error_messages"]["Studio_Story_Voiceover_Receipt_JSON"])
   if not (receipt.get("fingerprint")==digest and receipt.get("state")=="failed" and receipt.get("sha256")==sha): raise ValueError("receipt_gate")
   if sha:
    data=get(local+"/internal/story-audio/"+pid+"/"+digest+"/"+sha+".mp3",bound=8388608)
    if hashlib.sha256(data).hexdigest()!=sha: raise ValueError("local_audio_checksum")
   if queue(rid)!=(state,yields): raise ValueError("queue_changed")
   work()
   try:
    reply=json.loads(get(local+"/jobs/studio-produce/resume",auth,body={"production_request_record_id":rid}))
    accepted=reply.get("accepted") is True
   except Exception: accepted=False
   new=queue(rid)[0]
   result.update(status="resume_observed" if new in ("queued","running") else "resume_unverified",accepted=accepted,queue_state=new)
 except Exception as exc:
  result["status"]="guard_or_read_failed"
  result["reason"]=str(exc) if isinstance(exc,ValueError) and str(exc).endswith(("_gate","_checksum","_changed","_installed")) else "unverified"
 print("story2853_resume="+json.dumps(result,separators=(",",":")))
print("story2853_resume_proof=COMPLETE")
'@
$code | & python -
if($LASTEXITCODE -ne 0){throw 'story_resume_python_failed'}
}finally{
Remove-Item Env:STORY_RESUME_SB,Env:STORY_RESUME_KEY,Env:STORY_RESUME_RUNNER,Env:STORY_RESUME_DB,Env:STORY_RESUME_ROOT -ErrorAction SilentlyContinue
}
