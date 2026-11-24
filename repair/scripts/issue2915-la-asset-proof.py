#!/usr/bin/env python3
"""Exact future scheduled LA #10735/#10736 media proof. Read-only, no uploads,
no provider operations, no database writes or approval/schedule changes."""
from __future__ import annotations
import hashlib,json,os,shutil,subprocess,sys,tempfile
from datetime import datetime,timezone
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
PROFILE="aa4b857d-e588-46aa-97ba-77cdd3c25dff"
DRIVE_ID="1QtQpHo46coMmW0fLJuQd9WrJCH8LMN5V"
PREVIEW="https://media.chicagoshining.com/studio/previews/rechlV1l1L3vKhiFA/jobs/job-20261117052248-d9f4dda9.mp4"
TARGETS={
    10735:("rechlV1l1L3vKhiFA","YouTube","YouTube Short","2027-01-10T13:30:00+00:00"),
    10736:("recUDEKS5Iqn8AUKA","Facebook","Facebook Reel","2027-01-19T00:30:00+00:00"),
}
BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"

def exact(row):
    n=row.get("output_number")
    expected=TARGETS.get(n)
    if not expected: raise RuntimeError("wrong_output")
    rid,platform,kind,date=expected
    e=row.get("error_messages") or {}
    due=datetime.fromisoformat(str(row.get("scheduled_post_date") or "").replace("Z","+00:00"))
    if (row.get("airtable_record_id")!=rid or row.get("content_number")!=2133
        or row.get("content_profile_id")!=PROFILE or row.get("platform")!=platform
        or row.get("platform_output_type")!=kind or row.get("output_status")!="Approved for Publishing"
        or row.get("review_status")!="Approved" or row.get("publish_status")!="Ready to Schedule"
        or row.get("render_status")!="Rendered" or row.get("do_not_publish") is not False
        or row.get("auto_publish_enabled") is not True or row.get("test_run_id")
        or row.get("published_at") or row.get("platform_post_url") or row.get("publish_asset_url")
        or row.get("studio_preview_url")!=PREVIEW
        or row.get("final_file_url")!="https://drive.google.com/file/d/"+DRIVE_ID+"/view"
        or due!=datetime.fromisoformat(date) or due<=datetime.now(timezone.utc)
        or not row.get("updated_at")
        or any(e.get(key) for key in ("Platform_Post_ID","Platform_Media_ID","Publish_Locked_At","Studio_Render_Review_Hold_Active","Factory_Review_Handoff_Safety_Hold_At"))):
        raise RuntimeError("exact_future_approval_or_media_changed")
    return row

def get(table,params):
    k=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r=requests.get(PROJECT+"/rest/v1/"+table,params=params,headers={"apikey":k,"Authorization":"Bearer "+k},timeout=30)
    r.raise_for_status()
    return r.json()

def preflight():
    rows=get("platform_outputs",{"output_number":"in.(10735,10736)","select":"output_number,airtable_record_id,content_number,content_item_id,content_profile_id,platform,platform_output_type,output_status,review_status,publish_status,render_status,do_not_publish,auto_publish_enabled,test_run_id,published_at,platform_post_url,publish_asset_url,studio_preview_url,final_file_url,scheduled_post_date,studio_scheduled_at,updated_at,error_messages","limit":3})
    if len(rows)!=2 or {r["output_number"] for r in rows}!=set(TARGETS):raise RuntimeError("exact_rows_missing")
    for r in rows:exact(r)
    if len({r["content_item_id"] for r in rows})!=1:raise RuntimeError("parent_mismatch")
    p=get("content_items",{"id":"eq."+rows[0]["content_item_id"],"select":"id,content_number,content_profile_id","limit":2})
    if len(p)!=1 or p[0]["content_number"]!=2133 or p[0]["content_profile_id"]!=PROFILE:raise RuntimeError("parent_mismatch")
    return {r["output_number"]:r for r in rows}

def main():
    if not (BASE/".env").is_file():raise RuntimeError("runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    if not os.getenv("PORT"):os.environ["PORT"]="3350"
    sys.path.insert(0,str(BASE))
    for k in ("SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN"):
        if not os.getenv(k):raise RuntimeError("missing_owner_credential_"+k)
    if os.environ["SUPABASE_URL"].rstrip("/")!=PROJECT:raise RuntimeError("wrong_project")
    from integrations.google_drive import GoogleDriveClient
    from studio_produce.workload_governor import enabled as governor_enabled,resource_slot,recovery_read_only_active,circuit_open
    if not governor_enabled() or recovery_read_only_active() or circuit_open():raise RuntimeError("governed_workload_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    if not (health.get("ok") is True and health.get("studio_write_source")=="supabase" and health.get("studio_runner_output_read_source")=="supabase"):raise RuntimeError("authority_unverified")
    with resource_slot("issue_2915_la_asset_proof",limit=1):
        before=preflight()
        data,mime=GoogleDriveClient().download_file(DRIVE_ID)
        if mime!="video/mp4" or not data or len(data)>150_000_000:raise RuntimeError("drive_media_invalid")
        digest=hashlib.sha256(data).hexdigest()
        with requests.get(PREVIEW,headers={"Cache-Control":"no-cache"},timeout=60,stream=True) as r:
            r.raise_for_status()
            if r.headers.get("Content-Type","").split(";")[0] not in ("video/mp4","application/octet-stream"):raise RuntimeError("cdn_type_invalid")
            size=0;h=hashlib.sha256()
            for chunk in r.iter_content(chunk_size=1024*1024):
                size+=len(chunk)
                if size>len(data):raise RuntimeError("cdn_bytes_mismatch")
                h.update(chunk)
        if size!=len(data) or h.hexdigest()!=digest:raise RuntimeError("cdn_bytes_mismatch")
        probe=shutil.which("ffprobe") or os.getenv("FFPROBE_PATH")
        if not probe:raise RuntimeError("ffprobe_missing")
        with tempfile.TemporaryDirectory() as td:
            f=Path(td)/"approved.mp4";f.write_bytes(data)
            meta=json.loads(subprocess.check_output([probe,"-v","error","-show_streams","-show_format","-of","json",str(f)],timeout=45))
            video=[s for s in meta["streams"] if s.get("codec_type")=="video"]
            audio=[s for s in meta["streams"] if s.get("codec_type")=="audio"]
            if len(video)!=1 or len(audio)<1 or (video[0].get("width"),video[0].get("height"))!=(1080,1920) or video[0].get("codec_name")!="h264":raise RuntimeError("media_contract_invalid")
            duration=float(meta["format"]["duration"])
            if not 0<duration<=180:raise RuntimeError("duration_invalid")
        after=preflight()
        if any(after[n]["updated_at"]!=before[n]["updated_at"] for n in TARGETS):raise RuntimeError("output_changed_during_proof")
        print("ISSUE2915_LA_ASSET_PROOF="+json.dumps(dict(verified=True,outputs=sorted(TARGETS),content=2133,profile=PROFILE,drive_id=DRIVE_ID,url=PREVIEW,sha256=digest,size=size,geometry="1080x1920",duration_seconds=duration,audio_streams=len(audio),source_versions={str(n):before[n]["updated_at"] for n in TARGETS},source_writes=0,provider_writes=0,factory_approvals=0),separators=(",",":")),flush=True)

if __name__=="__main__":main()
