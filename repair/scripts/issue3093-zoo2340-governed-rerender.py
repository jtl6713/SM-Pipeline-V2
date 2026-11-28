"""One exact nonpublishing resume for owner-requested Zoo Miami replacement."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time

import requests
from dotenv import load_dotenv

BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"
PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
LOCAL = "http://127.0.0.1:3350"
REMOTION = "http://127.0.0.1:3333"
REQUEST = "receMQV008Cgr4d4L"
PARENT = "recQ12ZNaNvUCFHUZ"
VOICE = "hv8WzBOrsvuSUeIQGOCM"
ASSETS = ["recsfNsowf6DlC2ZJ","recAlW5Eqdq0iSdws","recVisw3UdO53PGP8","recnlplonEyfhbtUD","reczsxYncbya4rtHv","recm0344yqAFoZYiS","rec8cRBrMixseJUAg"]
OUTPUTS = {11366:"recRL0ElgmiMeCrCB",11367:"reckgKjanErnF0fu6",11368:"recCOqBl4WBgm9gDV",11369:"recMNRgOhg55kroN2",11370:"rec9dNkjjXVczL2cv",11371:"rece3pyxERb3K2pOj"}
PHASE = "init"

def require(value, reason):
    if not value:
        raise RuntimeError(reason)

def parse_marker(notes, marker):
    rows=[line[len(marker):] for line in notes.splitlines() if line.startswith(marker)]
    require(len(rows)==1,"directive_identity")
    return json.JSONDecoder().raw_decode(rows[0])[0]

def validate_storyboard(notes, extras):
    original=parse_marker(notes,"[story-first-production.1] ")
    timeline=parse_marker(notes,"[timed-script] ")
    scenes=original["scenes"]
    segments=timeline["segments"]
    require(len(scenes)==len(segments)==7 and original["target_seconds"]==74,"scene_count")
    require(timeline.get("force_exact_voiceover") is True and timeline.get("timing_source")=="timed_script","timed_authority")
    require([s["asset_id"] for s in scenes]==[s["asset_id"] for s in segments]==ASSETS,"scene_assets")
    require([s["voiceover"] for s in scenes]==[s["voiceover_text"] for s in segments],"scene_text_changed")
    require(extras["Voiceover_Script"]==" ".join(s["voiceover"].strip() for s in scenes),"parent_script_changed")
    require(extras.get("Voice_ID")==VOICE and extras.get("Requested_Script_Mode")=="Force exact","voice_or_script_mode")
    require(extras.get("Requested_Script")==extras["Voiceover_Script"],"requested_script_changed")
    return hashlib.sha256(extras["Voiceover_Script"].encode()).hexdigest()

def main():
    global PHASE
    require(dt.datetime.now(dt.timezone.utc)>=dt.datetime(2026,11,28,7,tzinfo=dt.timezone.utc),"before_owner_gate")
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    rh={"X-Pipeline-Secret":os.environ["PIPELINE_RUNNER_SHARED_SECRET"]}
    sb={"apikey":key,"Authorization":"Bearer "+key}
    def get(url, **kwargs):
        r=requests.get(url,timeout=20,**kwargs); r.raise_for_status(); return r.json()
    def table(name,params):
        rs=get(PROJECT+"/rest/v1/"+name,params=params,headers=sb)
        require(isinstance(rs,list),"canonical_read_invalid")
        return rs
    def exact(name,params):
        rs=table(name,params);require(len(rs)==1,"row_identity");return rs[0]
    def work():
        return get(LOCAL+"/admin/workload",headers=rh)
    def queue():
        path=Path(os.environ["STUDIO_GOVERNOR_DB_PATH"])
        require(path.is_absolute() and path.is_file(),"governor_db_missing")
        with sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
            states=db.execute("SELECT state FROM producer_jobs WHERE request_id=?",(REQUEST,)).fetchall()
            busy=db.execute("SELECT count(*) FROM producer_jobs WHERE state IN ('running','queued')").fetchone()[0]
            leases=db.execute("SELECT count(*) FROM resource_leases WHERE lease_until>?",(time.time(),)).fetchone()[0]
        return states,busy,leases
    def health_gate():
        h=get(LOCAL+"/health"); rem=get(REMOTION+"/health"); w=work()
        require(h.get("ok") is True and h.get("studio_write_source")=="supabase" and h.get("supabase_pipeline_writes") is True and h.get("workload_governor_enabled") is True and h.get("recovery_read_only") is False and h.get("airtable_activity",{}).get("any_activity") is False,"runner_health")
        require(rem.get("ok") is True and rem.get("remotionMaxConcurrent")==1 and all(rem.get(k)==0 for k in ("remotionActiveRenders","remotionPreparingJobs","remotionQueuedRenders","remotionInFlightJobs")),"renderer_busy")
        require(w.get("ok") is True and w.get("enabled") is True and w.get("database_circuit_phase") in ("closed","half_open") and w.get("max_jobs")==2 and w.get("admission_paused") is False and w.get("smv1_maintenance_active") is False and all(w.get(k)==0 for k in ("active_jobs","queued_jobs","active_worker_heavy")) and sum(w.get("active_resource_slots",{}).values())==0,"governor_not_idle_recovery")
        require(queue()==([("paused",)],0,0),"queue_not_exactly_idle")
        i1=Path(os.environ["I1_JOB_DB_PATH"])
        require(i1.is_absolute() and i1.is_file(),"i1_spool_missing")
        with sqlite3.connect(i1.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
            require(db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]==0,"i1_busy")
        require(not table("studio_global_workload_leases",{"select":"scope","lease_until":"gt."+dt.datetime.now(dt.timezone.utc).isoformat(),"limit":1}),"global_lease_active")
        return w
    def baseline():
        request=exact("production_requests",{"airtable_record_id":"eq."+REQUEST,"select":"*","limit":2})
        parent=exact("content_items",{"airtable_record_id":"eq."+PARENT,"select":"*","limit":2})
        require(request["production_request_id"]=="PR-20261125182555-YG46RT" and request["request_status"]=="Promoted" and request["production_job"]["job_id"]=="spj-a77610693702" and request["production_job"]["step"]=="audio","request_revision")
        require(parent["content_number"]==2340 and parent["voiceover_status"]=="Ready" and parent["content_status"]=="Ready for Voiceover","parent_state")
        e=parent["extras"]
        require(not e.get("Voiceover_URL") and not e.get("Voiceover_Google_Drive_File_ID"),"stale_voiceover_exists")
        require(e.get("Production_Request_Notes")==request["production_notes"],"notes_drift")
        script_hash=validate_storyboard(request["production_notes"],e)
        rows=table("platform_outputs",{"content_number":"eq.2340","select":"*","limit":7})
        require(len(rows)==6 and {row["output_number"]:row["airtable_record_id"] for row in rows}==OUTPUTS,"output_scope")
        for row in rows:
            n=row["output_number"]
            require(row["output_status"]=="In Production" and row["render_status"]=="Ready for Render" and row["review_status"] is None and row["publish_status"]=="Not Ready","output_not_prepared")
            require(row["do_not_publish"] is True and row["auto_publish_enabled"] is False and not any(row.get(k) for k in ("scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response","platform_publish_response_text","remotion_job_id","final_file_url","publish_asset_url","studio_preview_url")),"publication_fence")
            bag=row.get("error_messages") or {}
            require("Issue3093_Superseded_Revision" in bag and not bag.get("Voiceover_URL") and not bag.get("SM_Factory_Supabase_Approval_Receipt"),"stale_media_or_approval")
            clips=row["render_clip_list"]
            require([v["mediaAssetRecordId"] for v in sorted(clips,key=lambda x:int(x["order"]))]==(ASSETS[:1] if n in (11370,11371) else ASSETS),"asset_order_changed")
        return request,parent,rows,script_hash
    PHASE="health"
    # Half-open admission is a single naturally governed recovery probe. Never
    # force circuit closure or admit a second request while it is active.
    w=health_gate()
    PHASE="baseline"
    before=baseline()
    print("ZOO3093_PREPARED="+json.dumps({"content":2340,"outputs":6,"scenes":7,"script_sha256":before[3],"voice":"Briony","circuit":w.get("database_circuit_phase"),"all_unpublished":True}),flush=True)
    PHASE="pre_submit"
    require(baseline()==before,"baseline_drift")
    health_gate()
    marker=BASE/"issue3093-zoo2340-resume-once.json"
    with marker.open("x",encoding="utf-8") as f:
        json.dump({"request":REQUEST,"job":"spj-a77610693702","script_sha256":before[3],"voice":VOICE,"at":dt.datetime.now(dt.timezone.utc).isoformat()},f)
        f.flush();os.fsync(f.fileno())
    PHASE="submit"
    response=requests.post(LOCAL+"/jobs/studio-produce/resume",headers=rh,json={"production_request_record_id":REQUEST,"resume":True},timeout=30)
    require(response.status_code==202,"submission_not_verified")
    answer=response.json()
    require(answer.get("ok") is True and answer.get("accepted") is True and answer.get("queued") is True and answer.get("production_request_record_id")==REQUEST,"acceptance_unverified")
    print("ZOO3093_ACCEPTED_ONCE="+REQUEST,flush=True)
    PHASE="observe"
    w=work()
    require(w.get("database_circuit_phase") in ("closed","half_open") and w.get("active_jobs",99)<=1 and w.get("queued_jobs",99)<=1 and w.get("active_worker_heavy")==0,"post_submit_governor")
    print("ZOO3093_SUBMISSION_PROOF="+json.dumps({"request":REQUEST,"outputs":6,"accepted":True,"scope":"render_only","publication_authorized":False}),flush=True)

if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        safe=str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__
        print("ZOO3093_ERROR="+PHASE+"_"+safe,flush=True)
        sys.exit(1)
