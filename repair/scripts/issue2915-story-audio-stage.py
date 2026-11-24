#!/usr/bin/env python3
"""Exact #2915 / PO5628 review-only Story media staging. Never mutates DB,
provider state, schedule, hold or approval; retains original media/history."""
from __future__ import annotations
import hashlib, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
RECORD="rec1Zg5eEJjQKzUDO"
PROFILE="65e9071a-d2fd-4898-88a4-111bf8a3bfb5"
DRIVE_ID="1y_6ekGu08A5Z9U75NSzZFXShFWhGRrSV"
OLD_DRIVE_ID="1CTcy2wE3OrQbgXQn7K5a2NuTXS7H22_j"
VOICE_ID="1dDQQfM2uKG7aV1NzKeuv59EO_UjXhCzq"
SHA="e9f4ad61913fe88aad28bcf6df5643bd8586c74c34ab0b2fe1c9b2d37c3a747f"
SIZE=8368028
KEY="studio/previews/repairs/issue2915/miami-1018/po5628-"+SHA[:16]+".mp4"
BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"

def setup():
    if not (BASE/".env").is_file():raise RuntimeError("runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    sys.path.insert(0,str(BASE))
    for k in ("SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN","R2_UPLOAD_WORKER_URL","R2_UPLOAD_WORKER_SECRET"):
        if not os.getenv(k):raise RuntimeError("missing_owner_credential_"+k)
    if os.environ["SUPABASE_URL"].rstrip("/")!=PROJECT:raise RuntimeError("wrong_project")
    from integrations.google_drive import GoogleDriveClient
    from integrations.r2_upload import R2UploadClient
    return GoogleDriveClient(),R2UploadClient()

def get(table,params):
    k=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r=requests.get(PROJECT+"/rest/v1/"+table,params=params,headers={"apikey":k,"Authorization":"Bearer "+k},timeout=30)
    r.raise_for_status()
    return r.json()

def assert_exact(row):
    e=row.get("error_messages") or {}
    if (row.get("airtable_record_id")!=RECORD or row.get("output_number")!=5628
        or row.get("content_number")!=1018 or row.get("content_profile_id")!=PROFILE
        or row.get("platform")!="Instagram" or row.get("format")!="Story"
        or row.get("output_status")!="Approved for Publishing" or row.get("review_status")!="Approved"
        or row.get("publish_status")!="Failed" or row.get("do_not_publish") is not True
        or row.get("auto_publish_enabled") is not False or row.get("publish_retry_eligible") is not False
        or row.get("published_at") or row.get("platform_post_url")
        or OLD_DRIVE_ID not in str(row.get("final_file_url") or "")
        or str(e.get("IG_Story_Container_ID"))!="18116418158139610"):
        raise RuntimeError("story_scope_or_provider_fence_changed")
    if not row.get("updated_at"):raise RuntimeError("missing_version")

def preflight():
    rows=get("platform_outputs",{"output_number":"eq.5628","select":"airtable_record_id,output_number,content_number,content_profile_id,platform,format,output_status,review_status,publish_status,do_not_publish,auto_publish_enabled,publish_retry_eligible,published_at,platform_post_url,final_file_url,studio_preview_url,publish_asset_url,updated_at,error_messages","limit":2})
    if len(rows)!=1:raise RuntimeError("exact_story_missing")
    row=rows[0];assert_exact(row)
    content=get("content_items",{"content_number":"eq.1018","select":"content_profile_id,content_title,extras","limit":2})
    if len(content)!=1 or content[0].get("content_profile_id")!=PROFILE or VOICE_ID not in str((content[0].get("extras") or {}).get("Voiceover_URL","")):
        raise RuntimeError("narration_identity_changed")
    return row

def verify_media(data):
    if len(data)!=SIZE or hashlib.sha256(data).hexdigest()!=SHA:raise RuntimeError("candidate_bytes_changed")
    # The local candidate was visually inspected and entirely decoded, with
    # exact 15.5s H264 1080x1920 and AAC stereo. Verify independently when the
    # runner exposes FFprobe; SHA pins the reviewed bytes either way.
    probe=shutil.which("ffprobe") or os.getenv("FFPROBE_PATH")
    if not probe: return "sha256_matches_locally_probed_exact_bytes"
    with tempfile.TemporaryDirectory() as td:
        f=Path(td)/"candidate.mp4";f.write_bytes(data)
        meta=json.loads(subprocess.check_output([probe,"-v","error","-show_streams","-show_format","-of","json",str(f)],timeout=30))
        v=[s for s in meta["streams"] if s.get("codec_type")=="video"]
        a=[s for s in meta["streams"] if s.get("codec_type")=="audio"]
        if len(v)!=1 or len(a)!=1 or v[0].get("codec_name")!="h264" or (v[0].get("width"),v[0].get("height"))!=(1080,1920) or a[0].get("codec_name")!="aac" or a[0].get("channels")!=2 or abs(float(meta["format"]["duration"])-15.5)>.06:
            raise RuntimeError("candidate_media_contract_changed")
    return "runner_ffprobe_verified"

def main():
    drive,r2=setup()
    from studio_produce.workload_governor import enabled as governor_enabled, resource_slot, recovery_read_only_active, circuit_open
    if not governor_enabled() or recovery_read_only_active() or circuit_open():raise RuntimeError("governed_workload_unavailable")
    health=requests.get("http://127.0.0.1:3350/health",timeout=20).json()
    if not (health.get("ok") is True and health.get("studio_write_source")=="supabase" and health.get("studio_runner_output_read_source")=="supabase"):raise RuntimeError("supabase_authority_unavailable")
    with resource_slot("issue_2915_story_audio_stage",limit=1):
        before=preflight()
        data,mime=drive.download_file(DRIVE_ID)
        if mime!="video/mp4":raise RuntimeError("candidate_mime_changed")
        media_proof=verify_media(data)
        r2.put_object(KEY,data,"video/mp4")
        url="https://media.chicagoshining.com/"+KEY
        for attempt in range(5):
            try:
                r=requests.get(url,headers={"Cache-Control":"no-cache"},timeout=40)
                r.raise_for_status()
                if hashlib.sha256(r.content).hexdigest()!=SHA or len(r.content)!=SIZE:raise RuntimeError("cdn_hash_mismatch")
                break
            except (requests.RequestException,RuntimeError):
                if attempt==4:raise
                time.sleep(3)
        after=preflight()
        if after["updated_at"]!=before["updated_at"] or after["final_file_url"]!=before["final_file_url"]:raise RuntimeError("canonical_story_changed_during_stage")
        print("ISSUE2915_STORY_AUDIO_STAGE="+json.dumps(dict(verified=True,output=5628,content=1018,record_id=RECORD,updated_at=before["updated_at"],drive_id=DRIVE_ID,url=url,sha256=SHA,size=SIZE,geometry="1080x1920",duration_seconds=15.5,media_proof=media_proof,source_writes=0,provider_writes=0,factory_approvals=0,hold_preserved=True),separators=(",",":")),flush=True)

if __name__=="__main__":main()
