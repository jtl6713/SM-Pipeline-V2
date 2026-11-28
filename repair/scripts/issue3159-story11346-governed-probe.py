"""One exact governed Story recovery. No publishing, approval, or schedule writes."""
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
REQUEST = "recv3RruCzNtq4bes"
PARENT = "recm83Z4R3CdpgQrI"
TARGET = "recRyS2Gsy8uh10ND"
JOB = "spj-847eb830f431"
FINGERPRINT = "c236814455fa9924a5ba9243fb562c6ed604c3d2765478ee425d932be9fd09f2"
SHA = "8c39d2c97bd256b8555c45dd20d49728b9596745a94f27b038d85fa37a2fe1ba"
SIBLINGS = {"rec4z6GbCVC2ZOQ9k", "rec6ljYtGgeZntLIC", "recgLHhzj6GETHT5r",
            "recDg9Z5w2bVsViCg", "recSD98TJ66ys0Yin"}
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
    require(r.get("state") in ("failed","verified") and r.get("fingerprint")==FINGERPRINT
        and r.get("sha256")==SHA and r.get("url")==f"https://media.chicagoshining.com/studio/previews/story-voiceover/{PARENT}/{FINGERPRINT}.mp3",
        "receipt_changed")

def target_fence(row):
    require(row["airtable_record_id"]==TARGET and row["output_number"]==11346
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
        require(len(rs)==6 and {r["airtable_record_id"] for r in rs}==SIBLINGS|{TARGET},"sibling_identity_changed")
        return {r["airtable_record_id"]:r for r in rs}
    def job():
        rs=table("production_requests",{"airtable_record_id":"eq."+REQUEST,"select":"*","limit":2})
        require(len(rs)==1 and rs[0]["production_request_id"]=="PR-20261125013316-VRQGTS","request_identity_changed")
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
    PHASE="health"
    health=get(LOCAL+"/health")
    h=get(REMOTION+"/health")
    require(health.get("ok") is True and health.get("studio_write_source")=="supabase"
        and health.get("supabase_pipeline_writes") is True and health.get("workload_governor_enabled") is True
        and health.get("recovery_read_only") is False
        and health.get("airtable_activity",{}).get("any_activity") is False,"runner_health")
    require(h.get("ok") is True and h.get("remotionMaxConcurrent")==1
        and all(h.get(k)==0 for k in ("remotionActiveRenders","remotionPreparingJobs","remotionQueuedRenders","remotionInFlightJobs")),"renderer_busy")
    w=work()
    sample,errors=observe_governor(w)
    print("STORY3159_GOVERNOR="+json.dumps({"phase":"preflight","sample":sample,"errors":errors}),flush=True)
    require(not errors and sample["active_jobs"]==0 and sample["queued_jobs"]==0
        and sample["combined_heavy_active"]<2,"preflight_capacity")
    paused=w["paused_jobs"]
    require(paused>=1 and queue_state()[0]==[("paused",)],"queue_identity")
    # Check persisted I1 spool without claiming/recovering unrelated work.
    i1=Path(os.environ["I1_JOB_DB_PATH"])
    require(i1.is_absolute() and i1.is_file(),"i1_spool_missing")
    with sqlite3.connect(i1.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
        require(db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]==0,"i1_busy")
    # Normal globally coordinated admissions remain authoritative. No lease is reset or bypassed.
    PHASE="baseline"
    before=rows(); target=before[TARGET]
    original=receipt(target)
    require(original.get("fingerprint")==FINGERPRINT and original.get("sha256")==SHA,"original_identity_changed")
    require(original.get("state") in ("failed","verified") and re.fullmatch(r"[a-f0-9]{64}",str(FINGERPRINT)) and re.fullmatch(r"[a-f0-9]{64}",str(SHA)),"original_checksum_missing")
    target_fence(target)
    require(job()["step"]=="render" and target["render_status"]=="Blocked"
        and target["output_status"]=="In Production" and not target.get("final_file_url") and not target.get("remotion_job_id")
        and (target.get("error_messages") or {}).get("Remotion_Error_Message") in (
            "Studio Story narration integrity guard: Story narration cache unavailable; refuse duplicate paid attempt",
            "Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
            "Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation"),"target_baseline_changed")
    require(all(before[i]["output_status"]=="Approved for Publishing" and before[i]["review_status"]=="Approved"
        and before[i]["render_status"]=="Rendered" and before[i].get("final_file_url") and before[i].get("thumbnail_url")
        for i in SIBLINGS),"approved_sibling_changed")
    PHASE="private_audio"
    # The live production Runner itself must prove private transport and bytes.
    r=requests.get(f"{LOCAL}/internal/story-audio/{PARENT}/{FINGERPRINT}/{SHA}.mp3",timeout=30,stream=True)
    try:
        require(r.status_code==200,"private_story_transport_unavailable")
        data=b""
        for chunk in r.iter_content(65536):
            data+=chunk
            require(len(data)<=2*1024*1024,"audio_byte_budget")
    finally: r.close()
    require(32<len(data)<=2*1024*1024 and hashlib.sha256(data).hexdigest()==SHA,"audio_checksum")
    with tempfile.TemporaryDirectory(prefix="3159-story-") as d:
        mp3=Path(d)/"voice.mp3"; mp3.write_bytes(data)
        seconds=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",str(mp3)],timeout=20))
        require(2<=seconds<=9.9,"audio_duration")
        v=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(mp3),"-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=30)
        peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",v.stderr)
        require(v.returncode==0 and peak and float(peak.group(1))>=-18,"audio_not_audible")
        print("STORY3159_AUDIO="+json.dumps({"bytes":len(data),"sha256":SHA,"seconds":seconds,"peak_db":float(peak.group(1))}),flush=True)
    PHASE="pre_submit"
    require(rows()==before and job()["step"]=="render" and queue_state()[0]==[("paused",)],"baseline_drift")
    sample,errors=observe_governor(work())
    require(not errors and sample["active_jobs"]==0 and sample["queued_jobs"]==0 and sample["combined_heavy_active"]<2,"governor_drift")
    # Permanent receipt before the single POST. A failure or timeout is not
    # permission to retry; reconcile actual state before any new authorization.
    marker=BASE/"outage3159-story11346-once.json"
    with marker.open("x",encoding="utf-8") as file:
        json.dump({"request":REQUEST,"job":JOB,"output":11346,"sha256":SHA,"at":dt.datetime.now(dt.timezone.utc).isoformat()},file)
        file.flush();os.fsync(file.fileno())
    PHASE="submit"
    response=requests.post(LOCAL+"/jobs/studio-produce/resume",headers=rh,json={"production_request_record_id":REQUEST,"resume":True},timeout=30)
    require(response.status_code==202,"submission_not_verified")
    answer=response.json()
    require(answer.get("ok") is True and answer.get("accepted") is True
        and answer.get("queued") is True and answer.get("production_request_record_id")==REQUEST,"acceptance_unverified")
    print("STORY3159_ACCEPTED_ONCE="+REQUEST,flush=True)
    PHASE="observe"
    after=None
    for _ in range(42):
        time.sleep(5)
        w=work(); current=rows(); j=job()
        sample,errors=observe_governor(w)
        print("STORY3159_GOVERNOR="+json.dumps({"phase":"observe","sample":sample,"errors":errors}),flush=True)
        require(not errors,"post_submit_governor")
        require(all(current[i]==before[i] for i in SIBLINGS),"approved_sibling_mutated")
        target_fence(current[TARGET])
        require(j["step"] not in ("blocked","escalated"),"producer_blocked")
        if j["step"]=="done" and queue_state()[0]==[]:
            after=current[TARGET]; break
    require(after is not None,"observe_timeout_no_retry")
    require(after["output_status"]=="Ready for Review" and after["render_status"]=="Rendered" and after.get("final_file_url") and after.get("remotion_job_id") and receipt(after).get("state")=="verified","factory_state_unverified")
    PHASE="media"
    preview=after.get("studio_preview_url") or ""
    require(re.fullmatch(r"job-[a-zA-Z0-9-]+",str(after.get("remotion_job_id"))) is not None and preview==f"https://media.chicagoshining.com/studio/previews/{TARGET}/jobs/{after['remotion_job_id']}.mp4","preview_identity")
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
    PHASE="final_readback"
    require(rows()=={**before,TARGET:after} and job()["step"]=="done" and queue_state()[0]==[],"final_readback_changed")
    sample,errors=observe_governor(work())
    print("STORY3159_GOVERNOR="+json.dumps({"phase":"final","sample":sample,"errors":errors}),flush=True)
    require(not errors,"final_governor")
    print("STORY3159_PROOF="+json.dumps({"output":11346,"sibling_records_unchanged":5,"circuit":"closed","hold_preserved":True,"approval_required":True,"submissions":1,"render_job":after["remotion_job_id"],"media":media}),flush=True)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("STORY3159_ERROR="+PHASE+"_"+(str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__),flush=True)
        sys.exit(1)
