"""Becky incident 3159: at most one exact storage-guard parent per cycle. No publishing or approval writes."""
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
COHORT = [
    {
        "request": "recCliROtkw6N03tW",
        "parent": "recAdiURMeoS8VJnJ",
        "job": "spj-d9d4ff9b8fcf",
        "name": "PR-20261125013438-6G94EM",
        "stories": {"recDH1TiBHlR3kJ85":11250,"recqs15ffqAvC0bU7":11251},
        "siblings": ["rechGp2O1CBjGyetM","recKuxwvLaWscxH96","recTf8L9nZvozugAN","recgr10CGfPa5AsIM"],
        "fingerprint": "9362a08d77676c85b03fb4d40e2c0f5ae68b8e465216dc57d7384f5a0551e9f3",
        "history": {"claim":"recDH1TiBHlR3kJ85","sha256":"9da1b64b3f60f958dd7d286a7551ba7be72601d4bcf9483b95712df980a832ef","created_at":1795662013}
    },
    {
        "request": "recLprSXgeNbgKABG",
        "parent": "recbjg7rXQCiA6DzY",
        "job": "spj-b8cba2008c3b",
        "name": "PR-20261125015004-FYXB9U",
        "stories": {
            "recONsGlBKsE8VTdP": 11240,
            "recKwClsbFCOJaKbC": 11241
        },
        "siblings": [
            "recDpIhU2YQzjNX8a",
            "recXr2l859AnZkK1f",
            "recEyaTmyn4m2YBzg",
            "recvLW8Slruf38vHE"
        ],
        "fingerprint": "1aae9a3cef8cc1fefb95b70155656760dc993e3252d348f746d94d50dedea852"
    },
    {
        "request": "recqfMGjV1CnCP5CB",
        "parent": "rec0gE5IoTuSoqy5E",
        "job": "spj-507e47315148",
        "name": "PR-20261125020255-LNTH9X",
        "stories": {
            "receOfwtyngfyCboh": 11262,
            "recgCPmQEWy5cA5Nw": 11263
        },
        "siblings": [
            "recZ4VQiZwDFdV3ES",
            "rec0MgDWDbnFMMv1R",
            "recv2FiOR2Cirmjq2",
            "recCdUyGSbCgELtlD"
        ],
        "fingerprint": "cae8fcf0c3e661c0ba84af5bde37630b8ca97b0d6fdf28e5edad6c8352ee9cc7"
    },
    {
        "request": "recKEr3ODsfNktfRr",
        "parent": "rec1LmWHV6VvfdXp0",
        "job": "spj-7312a08e15ed",
        "name": "PR-20261125023505-C8AHM1",
        "stories": {
            "recv8TRI6cYAwF1AF": 11268,
            "recqIuVlct8IMs56a": 11269
        },
        "siblings": [
            "recB1EBNPlsSH2wic",
            "recdpFoKZso5MJvqP",
            "recdQfNKS3NDaeu5a",
            "recmCasHl2KczFhHh"
        ],
        "fingerprint": "eb8b53dd293d30b2330452d2ee4b4a3ceb71314ab182a9d6668bfb884702acff"
    },
    {
        "request": "recmnzwPSdKUYTioL",
        "parent": "recKTD3ZnQpNxxvgH",
        "job": "spj-36974e5ee4a9",
        "name": "PR-20261125015517-TRRLBR",
        "stories": {
            "reczMVFz209yngV1H": 11310,
            "recCypRwiZF4xHMgE": 11311
        },
        "siblings": [
            "recWAZYeW0AjXRzfU",
            "recjZ3rO1mKOtCkw6",
            "rec5Uan8VDPoYosN5",
            "reclg0bUmZ4FujelK"
        ],
        "fingerprint": "37166e6ba347f88dd0f88ea6b8c82cd9d4f23e41c3b65ab2f05218c4bc14e4b1"
    },
    {
        "request": "recA97cVeskb9KQBm",
        "parent": "recQnOwB4Qg9FHIup",
        "job": "spj-204c783abd6c",
        "name": "PR-20261125013409-KZ1N8G",
        "stories": {
            "reclCt4yPUBDhPR9Y": 11316,
            "recfrU5PjR5d5VwsR": 11317
        },
        "siblings": [
            "recdO6F0E2rIsoUu6",
            "recNSZat1EbYwKHYP",
            "rectAMY2i0IqdJijk",
            "rec14ac9uFPpXEwJ4"
        ],
        "fingerprint": "44025e7f5c36ee7be229c8bfc18f8a50c5a05956da5418d6c2ba41a3d0552ccb"
    },
    {
        "request": "rec2yYRS9aVFeK1r3",
        "parent": "recrUkXlSXxtwztFU",
        "job": "spj-ecee66d967b7",
        "name": "PR-20261125013352-8AK1NB",
        "stories": {
            "recRHAB4dpThNs7TT": 11322,
            "recewgpHg6l7SI344": 11323
        },
        "siblings": [
            "recNKpKKQOdo7ttQM",
            "recKoUN5ybT1Bycrm",
            "recdhHruzJ1MuTlXP",
            "rec0p3ccFHUeGLP0u"
        ],
        "fingerprint": "9a31e2e854846221b3f4db01c744b95fbb20e144e2285a34a0f531be02f3ae59"
    },
    {
        "request": "reci9P7UQXRVFtuTM",
        "parent": "recsusqK58K0eP6z3",
        "job": "spj-fc821999471c",
        "name": "PR-20261125013346-5XZKZA",
        "stories": {
            "recihZZobVTvXDuer": 11328,
            "rec5wWC93FYeXiqRR": 11329
        },
        "siblings": [
            "recA47MByJcYZ84sk",
            "recqbTgXsFDUiH77C",
            "rec3ryKwcQbNcODCb",
            "recf2NMDrZMXhQXA1"
        ],
        "fingerprint": "1ac49c7889651b2a56fea685f1caf58aad4c6af2bf6ec184ac3586ecb4d8f236"
    },
    {
        "request": "recenOlc16BzYh6XV",
        "parent": "recs0vBdT1jmUIWL0",
        "job": "spj-485602388fb9",
        "name": "PR-20261125013322-9DNVGQ",
        "stories": {
            "recBOQEGqk0lgF4HF": 11340,
            "reckFi5S3Ynrxxggl": 11341
        },
        "siblings": [
            "rec67KnX39WE2FEAS",
            "recrYAgLe1h1HIWzs",
            "recfUmaVUQZIllhgA",
            "reccS9JI9e5j0nKUp"
        ],
        "fingerprint": "7b90b68508c2a93a8744a4b2f63a6386a642e4d8eca56e649a799b9ba9d9100d"
    },
    {
        "request": "recB4H2MSi6b0zhqz",
        "parent": "rec98yS7Pl7tAAqih",
        "job": "spj-240011e02b18",
        "name": "PR-20261125015505-9BADWW",
        "stories": {
            "recZVRMvmIYwTwKTd": 11226,
            "recvUWDcO2Y2L0MK1": 11227
        },
        "siblings": [
            "recazCj6ItHH0TuOl",
            "recXN5AI6V4kQ98Xo",
            "recqHtw90LTcFhXfJ",
            "recPRFkZmeQ3FvLOi"
        ],
        "fingerprint": "409cd89bc52e929c6dbd57d0f11d2acfa1673446ccb7ddc03c4d448e4ac7a9b6"
    }
]
REQUEST = PARENT = JOB = FINGERPRINT = NAME = None
PAIR = {}
SIBLINGS = set()
HISTORY = None
LOCAL = "http://127.0.0.1:3350"
REMOTION = "http://127.0.0.1:3333"
GATE = dt.datetime(2026,11,28,7,tzinfo=dt.timezone.utc)
PHASE = "init"
# Local read-only audit limit for exact allowlisted, newly completed Stories.
# No global producer, transfer or publication limit is changed.
LIMIT = 64*1024*1024
# Canonical preflight identified real creative conflicts. Do not incur a new
# synthesis until an exact output-specific correction has been proven.
CREATIVE_EXCEPTIONS = {
    "rec2yYRS9aVFeK1r3": "dim_sum_source_logan_boulevard_requires_reconciliation",
    "reci9P7UQXRVFtuTM": "los_angeles_source_chicago_narration_requires_reconciliation",
}
def candidate_priority(candidate):
    return (11226 not in candidate["stories"].values(),)

def require(value, reason):
    if not value: raise RuntimeError(reason)

def stream_exact_media(response, path, expected_size):
    """Reject an oversized/mismatched response before it can fill disk."""
    require(0<expected_size<=LIMIT,"media_size_budget")
    require(response.status_code==200,"media_unavailable")
    declared=response.headers.get("Content-Length")
    require(declared is None or (declared.isdecimal() and int(declared)==expected_size),"media_content_length")
    n=0
    with path.open("wb") as out:
        for chunk in response.iter_content(1024*1024):
            n+=len(chunk)
            require(n<=expected_size,"media_byte_budget")
            out.write(chunk)
    require(n==expected_size,"media_length_mismatch")

def file_sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source,"sha256").hexdigest()

def inspect(path):
    info=json.loads(subprocess.check_output(
        ["ffprobe","-v","error","-count_frames","-show_streams","-show_format","-of","json",str(path)],
        timeout=45,stderr=subprocess.DEVNULL))
    video=[s for s in info["streams"] if s["codec_type"]=="video"]
    audio=[s for s in info["streams"] if s["codec_type"]=="audio"]
    require(len(video)==len(audio)==1,"stream_contract")
    v=video[0]; dur=float(info["format"]["duration"])
    require(v["width"]==1080 and v["height"]==1920 and int(v["nb_read_frames"])==300 and 9.95<=dur<=10.15,"video_contract")
    p=subprocess.run(["ffmpeg","-hide_banner","-nostats","-xerror","-i",str(path),"-map","0:v:0","-map","0:a:0","-af","volumedetect","-f","null","NUL"],capture_output=True,text=True,timeout=60)
    peak=re.search(r"max_volume:\s*(-?[0-9.]+) dB",p.stderr)
    require(p.returncode==0 and peak and float(peak.group(1))>-50,"video_decode_or_audio")
    return {"bytes":path.stat().st_size,"sha256":file_sha256(path),"frames":300,
            "width":1080,"height":1920,"duration":dur,"peak_db":float(peak.group(1)),"decode":"PASS"}


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
        require(row["render_status"] in ("Blocked","Ready for Render","Waiting in Render Queue")
            and not row.get("remotion_job_id") and not row.get("final_file_url"),"missing_receipt_after_rearm")
        return
    require(r.get("fingerprint")==FINGERPRINT and r.get("url")==f"https://media.chicagoshining.com/studio/previews/story-voiceover/{PARENT}/{FINGERPRINT}.mp3","receipt_identity")
    require(r.get("state") in ("generating","prepared","verified","failed"),"receipt_state")
    if r.get("state") in ("prepared","verified"):
        require(re.fullmatch(r"[a-f0-9]{64}",str(r.get("sha256") or "")),"receipt_checksum")
    elif r.get("state")=="failed":
        require(HISTORY and row["airtable_record_id"]==HISTORY["claim"]
            and row["render_status"]=="Blocked" and not r.get("sha256")
            and not row.get("remotion_job_id") and not row.get("final_file_url"),
            "ambiguous_narration_attempt_no_retry")
    if HISTORY and r.get("state") in ("prepared","verified"):
        require(r.get("history_original_sha256")==HISTORY["sha256"]
            and r.get("history_created_at")==HISTORY["created_at"],"history_provenance_changed")
    if HISTORY:
        require(r.get("state")!="generating","history_paid_generation_forbidden")

def target_fence(row):
    require(row["airtable_record_id"] in PAIR and row["output_number"]==PAIR[row["airtable_record_id"]]
        and row["do_not_publish"] is True and row["auto_publish_enabled"] is False
        and row["review_status"] not in ("Approved","Final Approved")
        and row["output_status"] in ("In Production","Ready for Review")
        and row["publish_status"]=="Not Ready"
        and row.get("publish_hold_reason")==("Studio exact source authority locked before R2; visuals may not be replaced or reordered." if 11310 in PAIR.values() else "Music duration not verified; repair before rendering.")
        and not row.get("production_approved_at")
        and not any(row.get(key) for key in ("scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","platform_publish_response","platform_publish_response_text"))
        and row["render_total_frames"]==300,"target_publication_fence")
    bag=row.get("error_messages") or {}
    require(not any(bag.get(k) for k in ("Production_Approved_At","Platform_Post_ID","Platform_Media_ID","IG_Story_Container_ID","IG_Story_Post_ID","Publish_Started_At","Last_Publish_Attempt_At","Studio_Publish_Dispatch_At","Publish_Locked_At")),"target_attempt_evidence")
    require(not any(str(bag.get(k) or "") not in ("","0") for k in ("Publish_Attempt_Count","Studio_Publish_Dispatch_Count")),"target_attempt_counter")
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


def recover(candidate):
    global PHASE, REQUEST, PARENT, JOB, FINGERPRINT, NAME, PAIR, SIBLINGS, HISTORY
    REQUEST,PARENT,JOB,FINGERPRINT,NAME,PAIR,SIBLINGS=(candidate["request"],candidate["parent"],candidate["job"],candidate["fingerprint"],candidate["name"],candidate["stories"],set(candidate["siblings"]))
    HISTORY=candidate.get("history")
    require(dt.datetime.now(dt.timezone.utc)>=GATE,"before_owner_gate")
    marker=BASE/f"outage3159-storage-{REQUEST}-once.json"
    if marker.exists():
        return False
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
        require(len(rs)==1 and rs[0]["production_request_id"]==NAME,"request_identity_changed")
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
    if not (paused>=1 and queue_state()[0]==[("paused",)]):
        return False
    # Check persisted I1 spool without claiming/recovering unrelated work.
    i1=Path(os.environ["I1_JOB_DB_PATH"])
    require(i1.is_absolute() and i1.is_file(),"i1_spool_missing")
    with sqlite3.connect(i1.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
        require(db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]==0,"i1_busy")
    # Normal globally coordinated admissions remain authoritative. No lease is reset or bypassed.
    PHASE="baseline"
    before=rows()
    if any(before[i].get(k) for i in PAIR for k in ("scheduled_post_date","studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url","production_approved_at")) or any(before[i]["publish_status"]!="Not Ready" for i in PAIR):
        return False
    if HISTORY:
        claim=HISTORY["claim"]
        require(claim in PAIR and set(i for i in before if receipt(before[i]))=={claim},"history_claim_set_changed")
        r=receipt(before[claim])
        require(r.get("state")=="failed" and not r.get("sha256") and r.get("fingerprint")==FINGERPRINT,"history_claim_changed")
        require(all((before[i].get("error_messages") or {}).get("Remotion_Error_Message")==(
            "Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt" if i==claim else
            "Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation") for i in PAIR),"history_guard_changed")
    else:
        require(all(not receipt(before[i]) for i in PAIR),"unexpected_prior_narration_receipt")
        require(all((before[i].get("error_messages") or {}).get("Remotion_Error_Message")==("Studio Story narration integrity guard: Story needs a complete concise narration sentence" if 11226 in PAIR.values() else "Studio Story narration integrity guard: Story narration storage existence not safely resolved") for i in PAIR),"storage_guard_changed")
    require(job()["step"]=="render","job_step_changed")
    for ident in PAIR:
        target=before[ident]
        target_fence(target)
        require(target["render_status"]=="Blocked" and target["output_status"]=="In Production"
                and not target.get("final_file_url") and not target.get("remotion_job_id"),"target_baseline_changed")
    require(all(before[i]["render_status"]=="Rendered" and before[i].get("final_file_url") and before[i].get("thumbnail_url")
        and ((before[i]["output_status"]=="Approved for Publishing" and before[i]["review_status"]=="Approved") if not HISTORY else
             (before[i]["output_status"]=="Ready for Review" and not before[i]["review_status"] and before[i]["publish_status"]=="Not Ready"
              and before[i]["do_not_publish"] is True and before[i]["auto_publish_enabled"] is False
              and before[i]["publish_hold_reason"]=="Music duration not verified; repair before rendering."
              and not any(before[i].get(k) for k in ("production_approved_at","scheduled_post_date","studio_scheduled_at","published_at"))))
        for i in SIBLINGS),"approved_sibling_changed")
    # Deployed R4 validates live fingerprint, exact source/hold, durable sibling
    # claim and storage absence before any first synthesis. No blind retry.
    PHASE="pre_submit"
    require(rows()==before and job()["step"]=="render" and queue_state()[0]==[("paused",)],"baseline_drift")
    sample,errors=observe_governor(work())
    require(not errors and sample["active_jobs"]==0 and sample["queued_jobs"]==0 and sample["combined_heavy_active"]<2,"governor_drift")
    # Permanent receipt before the single POST. A failure or timeout is not
    # permission to retry; reconcile actual state before any new authorization.
    with marker.open("x",encoding="utf-8") as file:
        json.dump({"request":REQUEST,"job":JOB,"outputs":sorted(PAIR.values()),"fingerprint":FINGERPRINT,"at":dt.datetime.now(dt.timezone.utc).isoformat()},file)
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
    for _ in range(84):
        time.sleep(5)
        w=work(); current=rows(); j=job()
        sample,errors=observe_governor(w)
        print("STORY3159_GOVERNOR="+json.dumps({"phase":"observe","sample":sample,"errors":errors}),flush=True)
        require(not errors,"post_submit_governor")
        require(all(current[i]==before[i] for i in SIBLINGS),"approved_sibling_mutated")
        for ident in PAIR:
            target_fence(current[ident])
            require(all(current[ident].get(k)==before[ident].get(k) for k in ("selected_assets","render_clip_list","publish_hold_reason")),"source_or_hold_changed")
        require(j["step"] not in ("blocked","escalated") and queue_state()[0]!=[("paused",)],"producer_blocked")
        if j["step"]=="done" and queue_state()[0]==[]:
            after={i:current[i] for i in PAIR}; break
    require(after is not None,"observe_timeout_no_retry")
    PHASE="media"
    # Same exact identity/size/stream/decode checks as the protected completed
    # Story audit; an oversized or ambiguous artifact remains an exception,
    # never grounds for replay of the original accepted request.
    if not os.getenv("PORT"): os.environ["PORT"]="3350"
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import workload_governor as g
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(),"media_governor_unavailable")
    drive=GoogleDriveClient()
    proofs={}
    for ident,row in after.items():
        require(row["output_status"]=="Ready for Review" and row["render_status"]=="Rendered" and row.get("final_file_url") and row.get("remotion_job_id") and receipt(row).get("state")=="verified","factory_state_unverified")
        preview=row.get("studio_preview_url") or ""
        require(re.fullmatch(r"job-[0-9]{14}-[a-f0-9]{8}",str(row.get("remotion_job_id"))) is not None and preview==f"https://media.chicagoshining.com/studio/previews/{ident}/jobs/{row['remotion_job_id']}.mp4","preview_identity")
        match=re.fullmatch(r"https://drive\.google\.com/file/d/([A-Za-z0-9_-]{10,100})/view",str(row.get("final_file_url") or ""))
        require(match,"drive_identity")
        drive_id=match.group(1)
        require(2<=float(receipt(row).get("seconds",0))<=9.9,"narration_duration")
        with tempfile.TemporaryDirectory(prefix="3159-story-video-") as d:
            a=Path(d)/"drive.mp4"; b=Path(d)/"preview.mp4"
            with g.resource_slot("transfer",key=f"3159-sweep-{PAIR[ident]}",limit=1,wait_seconds=5):
                meta=drive.get_file(drive_id,fields="id,size,mimeType,trashed")
                size_text=str(meta.get("size") or "")
                size=int(size_text) if size_text.isdecimal() else 0
                require(meta.get("id")==drive_id and meta.get("trashed") is False and meta.get("mimeType")=="video/mp4","drive_identity_or_type")
                require(0<size<=LIMIT,"drive_size_budget")
                with requests.get("https://www.googleapis.com/drive/v3/files/"+drive_id,
                    params={"alt":"media","supportsAllDrives":"true"},
                    headers={"Authorization":"Bearer "+drive.access_token()},
                    stream=True,timeout=(5,45),allow_redirects=False) as response:
                    stream_exact_media(response,a,size)
                with requests.get(preview,stream=True,timeout=(5,45),allow_redirects=False) as response:
                    stream_exact_media(response,b,size)
                require(drive.get_file(drive_id,fields="id,size,mimeType,trashed")==meta,"drive_metadata_changed")
            first=inspect(a); second=inspect(b)
            require(first["sha256"]==second["sha256"],"drive_preview_byte_mismatch")
        proofs[str(PAIR[ident])]={**second,"drive_sha256":first["sha256"],"drive_decode":first["decode"],"render_job":row["remotion_job_id"]}
    require(len({receipt(row)["sha256"] for row in after.values()})==1,"shared_narration_checksum")
    PHASE="final_readback"
    require(rows()=={**before,**after} and job()["step"]=="done" and queue_state()[0]==[],"final_readback_changed")
    sample,errors=observe_governor(work())
    print("STORY3159_GOVERNOR="+json.dumps({"phase":"final","sample":sample,"errors":errors}),flush=True)
    require(not errors,"final_governor")
    print("STORY3159_PROOF="+json.dumps({"output":min(PAIR.values()),"outputs":sorted(PAIR.values()),"sibling_records_unchanged":4,"circuit":"closed","publication_fence_preserved":True,"approval_required":True,"submissions":1,"history_original_sha256":HISTORY["sha256"] if HISTORY else None,"media":proofs}),flush=True)

    return True

def main():
    global PHASE
    require(len(COHORT)==10 and len({x["request"] for x in COHORT})==10,"cohort_identity")
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    path=Path(os.environ["STUDIO_GOVERNOR_DB_PATH"])
    require(path.is_absolute() and path.is_file(),"governor_db_missing")
    with sqlite3.connect(path.resolve().as_uri()+"?mode=ro",uri=True,timeout=3) as db:
        paused={r[0] for r in db.execute("SELECT request_id FROM producer_jobs WHERE state='paused'")}
    for candidate in sorted(COHORT,key=candidate_priority):
        rid=candidate["request"]
        if rid not in paused or (BASE/f"outage3159-storage-{rid}-once.json").exists():
            continue
        if rid in CREATIVE_EXCEPTIONS:
            print("SWEEP3159_CANDIDATE_SKIP="+json.dumps({"request":rid,"reason":CREATIVE_EXCEPTIONS[rid]}),flush=True)
            continue
        PHASE="candidate"
        try:
            if recover(candidate):
                return
        except RuntimeError as exc:
            # No alternative admission after a possibly accepted POST.
            if (BASE/f"outage3159-storage-{rid}-once.json").exists():
                raise
            if PHASE!="baseline":
                raise
            reason=str(exc)
            if not re.fullmatch(r"[a-z_]+",reason):
                raise
            print("SWEEP3159_CANDIDATE_SKIP="+json.dumps({"request":rid,"reason":reason}),flush=True)
    print("SWEEP3159_SKIP=no_eligible_storage_parent",flush=True)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("STORY3159_ERROR="+PHASE+"_"+(str(exc) if isinstance(exc,RuntimeError) and re.fullmatch(r"[a-z_]+",str(exc)) else type(exc).__name__),flush=True)
        sys.exit(1)
