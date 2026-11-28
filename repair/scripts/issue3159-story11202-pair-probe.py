"""Read-only reconciliation of accepted 11202/11203. Never resubmit."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import requests
from dotenv import load_dotenv

BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"
PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
REQUEST = "rec9iM9aQBPhA1e2q"
PARENT = "reccVyNLdmJJeI8hG"
TARGET = "recjqFCCxBroLyoQJ"
PAIR = {TARGET:11202,"recjhiYhg1ECvZUHo":11203}
JOB = "spj-6d4027b5f68c"
FINGERPRINT = "b55b795ffb32c1bf079705ddf7ad1248762847b0c5600b76c88df8e7401f6260"
SHA = "9977a3100b5ede15666c69ea061aafb25054221e9ceb6a345d319a5c0d23bd05"
HISTORY_CREATED = 1795576594
SIBLINGS = {"recTGV5aRLO8ozQPN", "recDq8zXGSpvm0GIH", "recsWGXZRJPhud1YK",
            "recU8UApFqpBbWWED"}
LOCAL = "http://127.0.0.1:3350"
REMOTION = "http://127.0.0.1:3333"
GATE = dt.datetime(2026,11,28,7,tzinfo=dt.timezone.utc)
PHASE = "init"

def require(value, reason):
    if not value: raise RuntimeError(reason)

def decode_receipt(value):
    for _ in range(3):
        if isinstance(value, dict): return value
        if isinstance(value, str): value=json.loads(value)
        else: break
    return {}

def receipt(row):
    return decode_receipt((row.get("error_messages") or {}).get("Studio_Story_Voiceover_Receipt_JSON"))

def require_receipt(row):
    r=receipt(row)
    if not r:
        require(row["airtable_record_id"]!=TARGET and row["render_status"]=="Blocked","missing_original_claim")
        return
    require(r.get("fingerprint")==FINGERPRINT and r.get("url")==f"https://media.chicagoshining.com/studio/previews/story-voiceover/{PARENT}/{FINGERPRINT}.mp3","receipt_identity")
    if r.get("state")=="failed":
        require(row["render_status"]=="Blocked" and not r.get("sha256"),"unexpected_failed_checksum")
    else:
        require(r.get("state")=="verified" and r.get("history_original_sha256")==SHA and r.get("history_created_at")==HISTORY_CREATED and re.fullmatch(r"[a-f0-9]{64}",str(r.get("sha256") or "")),"history_provenance")

def target_fence(row):
    require(row["airtable_record_id"] in PAIR and row["output_number"]==PAIR[row["airtable_record_id"]]
        and row["do_not_publish"] is True and row["auto_publish_enabled"] is False
        and row["review_status"] not in ("Approved","Final Approved")
        and row["output_status"] in ("In Production","Ready for Review")
        and row["publish_status"]=="Not Ready"
        and not any(row.get(key) for key in ("scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response","platform_publish_response_text"))
        and row["render_total_frames"]==300,"target_publication_fence")
    bag=row.get("error_messages") or {}
    require(not any(bag.get(k) for k in ("Production_Approved_At","Platform_Post_ID","Platform_Media_ID","IG_Story_Container_ID","IG_Story_Post_ID","Publish_Started_At","Last_Publish_Attempt_At","Studio_Publish_Dispatch_At","Publish_Locked_At")),"target_attempt_evidence")
    require_receipt(row)

def observe_governor(w):
    """Check configured capacity, not artificial exclusivity of a single probe.
    Report each failed invariant; never interpret unrelated legal work as failure.
    """
    keys = ("active_jobs", "active_worker_heavy", "combined_heavy_active", "queued_jobs", "paused_jobs", "max_jobs", "worker_heavy_limit")
    sample = {k:w.get(k) for k in keys}
    sample.update({k:w.get(k) for k in ("database_circuit_phase","admission_paused","smv1_maintenance_active")})
    errors = []
    if w.get("ok") is not True or w.get("enabled") is not True: errors.append("authority")
    if any(type(sample[k]) is not int or sample[k] < 0 for k in keys): errors.append("counter_contract")
    else:
        if sample["max_jobs"] != 2 or sample["worker_heavy_limit"] != 1: errors.append("capacity_config")
        if sample["active_jobs"] + sample["active_worker_heavy"] != sample["combined_heavy_active"]: errors.append("counter_mismatch")
        if sample["combined_heavy_active"] > sample["max_jobs"] or sample["active_worker_heavy"] > sample["worker_heavy_limit"]: errors.append("capacity_exceeded")
    if sample["database_circuit_phase"] != "closed": errors.append("circuit_not_closed")
    if sample["admission_paused"] is not False or sample["smv1_maintenance_active"] is not False: errors.append("admission_or_maintenance")
    return sample, errors


def main():
    global PHASE
    require(dt.datetime.now(dt.timezone.utc)>=GATE,"before_owner_gate")
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    secret=os.environ["PIPELINE_RUNNER_SHARED_SECRET"]
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb={"apikey":key,"Authorization":"Bearer "+key}
    rh={"X-Pipeline-Secret":secret}
    def get(url, **kwargs):
        r=requests.get(url,timeout=20,**kwargs); r.raise_for_status(); return r.json()
    def table(name, params):
        result=get(PROJECT+"/rest/v1/"+name,params=params,headers=sb)
        require(isinstance(result,list),"canonical_read_invalid")
        return result
    parent_rows=table("content_items",{"airtable_record_id":"eq."+PARENT,"select":"id,airtable_record_id","limit":2})
    require(len(parent_rows)==1 and parent_rows[0]["airtable_record_id"]==PARENT,"parent_identity")
    def rows():
        rs=table("platform_outputs",{"content_item_id":"eq."+parent_rows[0]["id"],"select":"*","limit":7})
        require(len(rs)==6 and {r["airtable_record_id"] for r in rs}==SIBLINGS|set(PAIR),"sibling_identity_changed")
        return {r["airtable_record_id"]:r for r in rs}
    def job():
        rs=table("production_requests",{"airtable_record_id":"eq."+REQUEST,"select":"*","limit":2})
        require(len(rs)==1 and rs[0]["production_request_id"]=="PR-20261125013514-5ANT57","request_identity_changed")
        j=rs[0]["production_job"]
        require(j["job_id"]==JOB,"job_identity_changed")
        return j
    def work(): return get(LOCAL+"/admin/workload",headers=rh)
    def queue_state():
        path=Path(os.environ["STUDIO_GOVERNOR_DB_PATH"])
        require(path.is_absolute() and path.is_file(),"governor_db_missing")
        db=sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True,timeout=3)
        try:
            q=db.execute("SELECT state FROM producer_jobs WHERE request_id=?",(REQUEST,)).fetchall()
            n=db.execute("SELECT count(*) FROM producer_jobs WHERE state IN ('running','queued')").fetchone()[0]
            leases=db.execute("SELECT count(*) FROM resource_leases WHERE lease_until>?",(time.time(),)).fetchone()[0]
            return q,n,leases
        finally: db.close()
    PHASE="accepted_marker"
    marker=BASE/"outage3159-story11202-once.json"
    saved=json.loads(marker.read_text(encoding="utf-8"))
    require(all(saved.get(k)==v for k,v in {"request":REQUEST,"job":JOB,"output":11202,"sha256":SHA}.items()),"accepted_marker_mismatch")
    PHASE="health"
    health=get(LOCAL+"/health")
    h=get(REMOTION+"/health")
    require(health.get("ok") is True and health.get("studio_write_source")=="supabase"
        and health.get("supabase_pipeline_writes") is True and health.get("workload_governor_enabled") is True
        and health.get("i1_durable_jobs") is True and health.get("recovery_read_only") is False
        and health.get("airtable_activity",{}).get("any_activity") is False,"runner_health")
    require(h.get("ok") is True and h.get("remotionMaxConcurrent")==1
        and type(h.get("remotionActiveRenders")) is int and 0<=h["remotionActiveRenders"]<=1,"renderer_capacity")
    sample,errors=observe_governor(work())
    require(not errors,"governor_invariants_failed")
    before=rows()
    require(job()["step"] in ("render","done"),"accepted_parent_state")
    require(all(before[i]["output_status"]=="Approved for Publishing" and before[i]["review_status"]=="Approved"
        and before[i]["render_status"]=="Rendered" and before[i].get("final_file_url") and before[i].get("thumbnail_url")
        for i in SIBLINGS),"approved_sibling_changed")
    PHASE="observe"
    after=None
    for _ in range(84):
        time.sleep(5)
        w=work(); current=rows(); j=job()
        sample,errors=observe_governor(w)
        print("STORY3159_GOVERNOR="+json.dumps({"phase":"observe","sample":sample,"errors":errors}),flush=True)
        require(not errors,"post_submit_governor")
        require(all(current[i]==before[i] for i in SIBLINGS),"approved_sibling_mutated")
        for ident in PAIR: target_fence(current[ident])
        require(j["step"] not in ("blocked","escalated"),"producer_blocked")
        if j["step"]=="done" and queue_state()[0]==[]:
            after={i:current[i] for i in PAIR}; break
    require(after is not None,"observe_timeout_no_retry")
    PHASE="media"
    proofs={}
    for ident,row in after.items():
        require(row["output_status"]=="Ready for Review" and row["render_status"]=="Rendered" and row.get("final_file_url") and row.get("remotion_job_id") and receipt(row).get("state")=="verified","factory_state_unverified")
        preview=row.get("studio_preview_url") or ""
        require(re.fullmatch(r"job-[a-zA-Z0-9-]+",str(row.get("remotion_job_id"))) is not None and preview==f"https://media.chicagoshining.com/studio/previews/{ident}/jobs/{row['remotion_job_id']}.mp4","preview_identity")
        with tempfile.TemporaryDirectory(prefix="3159-story-video-") as d:
            path=Path(d)/"story.mp4"; n=0
            with requests.get(preview,timeout=30,stream=True,allow_redirects=False) as r:
                require(r.status_code==200,"preview_unavailable")
                with path.open("wb") as f:
                    for chunk in r.iter_content(65536):
                        n+=len(chunk);require(n<=32*1024*1024,"video_byte_budget");f.write(chunk)
            info=json.loads(subprocess.check_output(["ffprobe","-v","error","-count_frames","-show_streams","-show_format","-of","json",str(path)],timeout=45))
            video=[s for s in info["streams"] if s["codec_type"]=="video"];audio=[s for s in info["streams"] if s["codec_type"]=="audio"]
            require(len(video)==len(audio)==1 and video[0]["width"]==1080 and video[0]["height"]==1920 and int(video[0]["nb_read_frames"])==300,"video_contract")
            v=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(path),"-map","0:v:0","-map","0:a:0","-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=60)
            peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",v.stderr)
            require(v.returncode==0 and peak and float(peak.group(1))>-50,"video_decode_or_audio")
            media={"bytes":n,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"frames":300,"duration":float(info["format"]["duration"]),"peak_db":float(peak.group(1))}
        proofs[str(PAIR[ident])]={**media,"render_job":row["remotion_job_id"]}
    require(len({receipt(row)["sha256"] for row in after.values()})==1,"shared_history_checksum")
    PHASE="final_readback"
    require(rows()=={**before,**after} and job()["step"]=="done" and queue_state()[0]==[],"final_readback_changed")
    sample,errors=observe_governor(work())
    print("STORY3159_GOVERNOR="+json.dumps({"phase":"final","sample":sample,"errors":errors}),flush=True)
    require(not errors,"final_governor")
    print("STORY3159_PROOF="+json.dumps({"output":11202,"outputs":[11202,11203],"siblings_unchanged_during_readback":4,"circuit":"closed","hold_preserved":True,"approval_required":True,"submissions":0,"media":proofs}),flush=True)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("STORY3159_ERROR="+PHASE+"_"+(str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__),flush=True)
        sys.exit(1)
