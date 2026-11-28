"""Exact Zoo revision coordination: safe checkpoint, atomic canonical handoff, release."""
import datetime as dt
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
import uuid
import requests
from dotenv import load_dotenv

BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"
PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
LOCAL="http://127.0.0.1:3350"
REMOTION="http://127.0.0.1:3333"
REQ="receMQV008Cgr4d4L"
PARENT="recQ12ZNaNvUCFHUZ"
REV="zoo2340-seven-scenes-v2-20261128"
OUTPUTS={11366:"recRL0ElgmiMeCrCB",11367:"reckgKjanErnF0fu6",11368:"recCOqBl4WBgm9gDV",11369:"recMNRgOhg55kroN2",11370:"rec9dNkjjXVczL2cv",11371:"rece3pyxERb3K2pOj"}

def require(ok,reason):
    if not ok: raise RuntimeError(reason)

def main():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"project_mismatch")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb={"apikey":key,"Authorization":"Bearer "+key}
    rh={"X-Pipeline-Secret":os.environ["PIPELINE_RUNNER_SHARED_SECRET"]}
    def get(url,**kw):
        r=requests.get(url,timeout=20,**kw);r.raise_for_status();return r.json()
    def table(name,params):
        return get(PROJECT+"/rest/v1/"+name,headers=sb,params=params)
    def request_row():
        rows=table("production_requests",{"airtable_record_id":"eq."+REQ,"select":"*","limit":2})
        require(len(rows)==1,"request_scope");return rows[0]
    def parent_row():
        rows=table("content_items",{"airtable_record_id":"eq."+PARENT,"select":"*","limit":2})
        require(len(rows)==1 and rows[0]["content_number"]==2340,"parent_scope");return rows[0]
    def outputs():
        rows=table("platform_outputs",{"content_number":"eq.2340","select":"*","limit":7})
        require(len(rows)==6 and {r["output_number"]:r["airtable_record_id"] for r in rows}==OUTPUTS,"output_scope")
        for r in rows:
            require(r["do_not_publish"] is True and r["auto_publish_enabled"] is False and not any(r.get(k) for k in ("published_at","platform_post_url","platform_publish_response","scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at")),"publication_fence")
        return rows
    def queue():
        path=Path(os.environ["STUDIO_GOVERNOR_DB_PATH"])
        require(path.is_absolute() and path.is_file(),"governor_db_missing")
        with sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
            q=db.execute("SELECT request_id,state FROM producer_jobs WHERE state IN ('queued','running')").fetchall()
            active=db.execute("SELECT count(*) FROM resource_leases WHERE lease_until>?",(time.time(),)).fetchone()[0]
        require(all(row[0]==REQ for row in q) and len(q)<=1,"unrelated_queue")
        return q,active
    def health():
        h=get(LOCAL+"/health")
        require(h.get("ok") is True and h.get("studio_write_source")=="supabase" and h.get("supabase_pipeline_writes") is True and h.get("workload_governor_enabled") is True and h.get("recovery_read_only") is False and h.get("airtable_activity",{}).get("any_activity") is False,"runner_health")
        w=get(LOCAL+"/admin/workload",headers=rh)
        require(w.get("ok") and w.get("enabled") and w.get("database_circuit_phase")=="closed" and w.get("admission_paused") is False and w.get("active_worker_heavy")==0,"workload_health")
        return w
    def no_global_leases():
        return not table("studio_global_workload_leases",{"select":"scope","lease_until":"gt."+dt.datetime.now(dt.timezone.utc).isoformat(),"limit":1})
    def remotion_idle():
        r=get(REMOTION+"/health")
        return r.get("ok") is True and all(r.get(k)==0 for k in ("remotionActiveRenders","remotionPreparingJobs","remotionQueuedRenders","remotionInFlightJobs"))
    def maintenance(token,action):
        r=requests.post(LOCAL+"/admin/workload/smv1-maintenance",headers=rh,json={"action":action,"token":token},timeout=20)
        require(r.status_code==200 and r.json().get("ok") is True,"maintenance_"+action+"_unverified")
    w=health();require(not w.get("smv1_maintenance_active"),"maintenance_owned_elsewhere")
    q,_=queue();require(len(q)==1 and no_global_leases(),"zoo_not_exact_owner")
    rows=outputs()
    require(all(r["render_status"]==("Blocked" if r["output_number"]<=11369 else "Rendered") for r in rows),"unexpected_output_state")
    require(remotion_idle(),"remotion_busy")
    token=uuid.uuid4().hex
    maintenance(token,"begin")
    try:
        for _ in range(25):
            q,leases=queue();w=health()
            if q==[(REQ,"queued")] and leases==0 and w.get("active_jobs")==0 and w.get("smv1_maintenance_active") and no_global_leases() and remotion_idle():break
            time.sleep(4)
        else: raise RuntimeError("safe_checkpoint_timeout")
        rows=outputs()
        require(all(r["render_status"]==("Blocked" if r["output_number"]<=11369 else "Rendered") for r in rows),"output_drift")
        req=request_row();p=parent_row()
        require(req["production_job"]["step"]=="render" and req["production_job"]["job_id"]=="spj-a77610693702" and p["voiceover_status"]=="Generated" and p["extras"]["Voice_ID"]=="hv8WzBOrsvuSUeIQGOCM" and float(p["extras"]["Voiceover_Duration_Seconds"])==76.997,"prior_revision")
        # Parent duration may be JSON text or number; the exact CAS transaction
        # independently validates the old voice and absence of measured timing.
        now=dt.datetime.now(dt.timezone.utc)
        marker={"revision":REV,"ready_at":now.isoformat(),"expires_at":(now+dt.timedelta(seconds=180)).isoformat()}
        bag=dict(req["publish_status"] or {})
        require("Issue3093_Repair_Revision" not in bag,"already_repaired")
        bag["Issue3093_Repair_Drain"]=marker
        rsp=requests.patch(PROJECT+"/rest/v1/production_requests",headers={**sb,"Prefer":"return=representation"},params={"airtable_record_id":"eq."+REQ,"updated_at":"eq."+req["updated_at"]},json={"publish_status":bag,"updated_at":now.isoformat()},timeout=20)
        rsp.raise_for_status()
        require(len(rsp.json())==1 and request_row()["publish_status"]["Issue3093_Repair_Drain"]==marker,"drain_marker_not_committed")
        print("ZOO3093_DRAIN_READY="+REV,flush=True)
        for _ in range(36):
            req=request_row()
            if (req.get("publish_status") or {}).get("Issue3093_Repair_Revision")==REV:
                p=parent_row();rows=outputs()
                require(req["production_job"]["step"]=="audio" and p["voiceover_status"]=="Ready" and p["extras"]["Requested_Script_Mode"]=="Force exact" and not p["extras"].get("Voiceover_URL") and not p["extras"].get("Voiceover_Google_Drive_File_ID"),"prepared_parent_not_exact")
                require(all(r["render_status"]=="Ready for Render" and r["output_status"]=="In Production" and not r.get("review_status") and not r.get("final_file_url") and not r.get("studio_preview_url") for r in rows),"prepared_outputs_not_exact")
                require(queue()[0]==[(REQ,"queued")],"queued_owner_changed")
                print("ZOO3093_REVISION_READY="+REV,flush=True)
                break
            time.sleep(5)
        else: raise RuntimeError("atomic_revision_not_received")
    finally:
        maintenance(token,"end")
        print("ZOO3093_MAINTENANCE_RELEASED=true",flush=True)
    print("ZOO3093_RECOVERY_PROOF="+json.dumps({"revision":REV,"outputs":6,"queue_preserved":True,"publication_authorized":False}),flush=True)

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("ZOO3093_DRAIN_ERROR="+(str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__),flush=True)
        sys.exit(1)
