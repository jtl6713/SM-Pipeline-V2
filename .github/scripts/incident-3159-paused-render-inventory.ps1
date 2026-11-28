$ErrorActionPreference='Stop'
$envPath='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env'
function Read-Setting([string]$name){
 $line=Get-Content -LiteralPath $envPath | Where-Object {$_ -match ('^\s*'+[regex]::Escape($name)+'\s*=')} | Select-Object -Last 1
 if(-not $line){throw 'inventory_setting_missing'}
 return ([string]$line -split '=',2)[1].Trim().Trim('"').Trim("'")
}
try{
$env:INV_SB=Read-Setting 'SUPABASE_URL'
if($env:INV_SB.TrimEnd('/') -ne 'https://vkwvscgisqsbuwagdvtb.supabase.co'){throw 'unexpected_project'}
$env:INV_KEY=Read-Setting 'SUPABASE_SERVICE_ROLE_KEY'
$env:INV_RUNNER=Read-Setting 'PIPELINE_RUNNER_SHARED_SECRET'
$env:INV_DB=Read-Setting 'STUDIO_GOVERNOR_DB_PATH'
$code=@'
import os,json,hashlib,urllib.request,urllib.parse,sqlite3,re
from pathlib import Path
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k): return None
opener=urllib.request.build_opener(NoRedirect())
base=os.environ["INV_SB"].rstrip("/")
key=os.environ["INV_KEY"]
local="http://127.0.0.1:3350"
def get(url,headers=None,params=None,bound=2097152):
 if params: url+="?"+urllib.parse.urlencode(params)
 with opener.open(urllib.request.Request(url,headers=headers or {},method="GET"),timeout=20) as r:
  b=r.read(bound+1)
  if len(b)>bound: raise ValueError("response_bound")
  return b
def rest(table,params):
 rows=json.loads(get(base+"/rest/v1/"+table,{"apikey":key,"Authorization":"Bearer "+key},params))
 if not isinstance(rows,list): raise ValueError("canonical_read")
 return rows
def one(table,params):
 rows=rest(table,{**params,"limit":2})
 if len(rows)!=1: raise ValueError("identity")
 return rows[0]
def receipt(row):
 v=(row.get("error_messages") or {}).get("Studio_Story_Voiceover_Receipt_JSON")
 for _ in range(3):
  if isinstance(v,dict): return v
  if isinstance(v,str) and v:
   try:v=json.loads(v)
   except ValueError:return {}
  else:break
 return {}
def valid(x,pat):return isinstance(x,str) and re.fullmatch(pat,x) is not None
def ident(x):return valid(x,r"rec[A-Za-z0-9]{14}")
def sha(x):return valid(x,r"[a-f0-9]{64}")
h=json.loads(get(local+"/health"));w=json.loads(get(local+"/admin/workload",{"X-Pipeline-Secret":os.environ["INV_RUNNER"]}));m=json.loads(get("http://127.0.0.1:3333/health"))
if not (h.get("ok") and h.get("studio_write_source")=="supabase" and h.get("supabase_pipeline_writes") is True and h.get("workload_governor_enabled") is True and h.get("i1_durable_jobs") is True and w.get("ok") and w.get("enabled") and w.get("max_jobs")==2 and m.get("ok")):raise ValueError("authority_gate")
print("paused3159_health="+json.dumps({"circuit":w.get("database_circuit_phase"),"cap":w.get("max_jobs"),"active":w.get("active_jobs"),"queued":w.get("queued_jobs"),"paused":w.get("paused_jobs"),"remotion_active":m.get("remotionActiveRenders")}))
with sqlite3.connect(Path(os.environ["INV_DB"]).resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
 q=db.execute("SELECT request_id,state,consecutive_yields FROM producer_jobs WHERE state='paused' ORDER BY request_id LIMIT 25").fetchall()
if len(q)>24:raise ValueError("inventory_cap")
history={"recnsuB2LUYKwygWI":"74db136af97d9f28c27cc8f95fc8248d316546b35bd54b0649c295eb5446c293","reccVyNLdmJJeI8hG":"b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260","recG0b34XYwYWggTp":"69e65eb8a0e00385ba952c8bfee7926fa8b6c6bc3562c2a3909e07718df71147"}
cache={};probes=0
for rid,state,yields in q:
 result={"request_record":rid if ident(rid) else "invalid","state":state,"yields":yields,"classification":"unverified","outputs":[]}
 try:
  if not ident(rid):raise ValueError("identity")
  r=one("production_requests",{"airtable_record_id":"eq."+rid,"select":"production_request_id,production_job,request_status,promoted_content_item_id,publish_status"})
  j=r.get("production_job") or {}
  name=r.get("production_request_id") or ""
  if not valid(name,r"PR-\d{14}-[A-Z0-9]{6}"):raise ValueError("request_identity")
  result.update(request=name,job=j.get("job_id") if valid(j.get("job_id"),r"spj-[a-f0-9]{12}") else None,step=j.get("step") if j.get("step") in ("render","done","blocked","escalated") else "other")
  if j.get("step")!="render" or r.get("request_status") not in ("Promoted","Submitted") or (r.get("publish_status") or {}).get("Test_Run_ID"):raise ValueError("not_render_candidate")
  parent=str(r.get("promoted_content_item_id") or "")
  col="airtable_record_id" if ident(parent) else "id" if valid(parent,r"[a-f0-9-]{36}") else None
  if not col:raise ValueError("parent_identity")
  p=one("content_items",{col:"eq."+parent,"select":"id,airtable_record_id"})
  pid=p["airtable_record_id"]
  if not ident(pid):raise ValueError("parent_identity")
  result["parent_record"]=pid
  rows=rest("platform_outputs",{"content_item_id":"eq."+p["id"],"select":"airtable_record_id,output_number,review_status,render_status,platform_output_type,do_not_publish,auto_publish_enabled,production_approved_at,scheduled_post_date,studio_scheduled_at,youtube_scheduled_publish_at,published_at,platform_post_url,platform_publish_response,remotion_job_id,final_file_url,error_messages","order":"output_number.asc","limit":13})
  if not 1<=len(rows)<=12:raise ValueError("sibling_inventory")
  for x in rows:
   b=x.get("error_messages") or {};v=receipt(x)
   o={"number":x.get("output_number"),"record":x["airtable_record_id"],"type":x.get("platform_output_type"),"render":x.get("render_status"),"approved":x.get("review_status")=="Approved","held":x.get("do_not_publish") is True}
   if o["approved"] or x.get("final_file_url"):o["action"]="preserve_existing"
   elif x.get("remotion_job_id"):o["action"]="reconcile_existing_render"
   elif x.get("render_status")=="Blocked" and "Story" in str(x.get("platform_output_type")):
    safe=o["held"] and x.get("auto_publish_enabled") is False and x.get("review_status") not in ("Approved","Final Approved") and not any(x.get(k) for k in ("production_approved_at","scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response")) and not any(b.get(k) for k in ("Platform_Post_ID","Platform_Media_ID","Publish_Started_At","Studio_Publish_Dispatch_At","IG_Story_Container_ID","IG_Story_Post_ID"))
    fp,sh=v.get("fingerprint"),v.get("sha256")
    o["receipt"]=v.get("state") if v.get("state") in ("verified","failed","prepared","generating") else "missing"
    o["action"]="story_guard_unresolved"
    if safe and sha(fp) and sha(sh) and v.get("url")=="https://media.chicagoshining.com/studio/previews/story-voiceover/"+pid+"/"+fp+".mp3":
     k=(pid,fp,sh)
     if k not in cache and probes<8:
      probes+=1
      try: cache[k]=hashlib.sha256(get(local+"/internal/story-audio/"+pid+"/"+fp+"/"+sh+".mp3")).hexdigest()==sh
      except Exception:cache[k]=False
     o["action"]="existing_audio_bytes_verified" if cache.get(k) is True else "audio_transport_unverified"
    elif safe and v.get("state")=="failed" and history.get(pid)==fp:o["action"]="exact_audited_history_candidate"
    elif safe and not v:o["action"]="story_receipt_missing"
   else:o["action"]="inspect_render_blocker"
   result["outputs"].append(o)
  result["classification"]="read_only_inventory"
 except Exception:result["classification"]="guard_or_read_failed"
 print("paused3159_row="+json.dumps(result,separators=(",",":")))
print("paused3159_proof="+json.dumps({"count":len(q),"audio_probes":probes,"writes":0,"submissions":0}))
'@
$code | & python -
if($LASTEXITCODE -ne 0){throw 'inventory_python_failed'}
}finally{
Remove-Item Env:INV_SB,Env:INV_KEY,Env:INV_RUNNER,Env:INV_DB -ErrorAction SilentlyContinue
}
