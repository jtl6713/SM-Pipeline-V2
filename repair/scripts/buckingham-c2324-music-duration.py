"""Exact selected soundtrack duration backfill, no production or provider writes."""
from __future__ import annotations
import hashlib, json, math, os, sys
from pathlib import Path
import requests
from dotenv import load_dotenv

PROJECT="https://vkwvscgisqsbuwagdvtb.supabase.co"
REQUEST="recWni5UcEHcq7mdX"
PARENT="reczHia8NBKgaCgCQ"
MUSIC="recu1x77Gy50AlYLI"
DRIVE="1NptYQLFLWhLdzUWI8t7-SKH_SiWCJAj2"
BASE=Path.cwd()/"Services"/"pipeline-runner"/"service"

def require(ok, reason):
    if not ok: raise RuntimeError(reason)

def headers():
    key=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return {"apikey":key,"Authorization":"Bearer "+key}

def rows(table, params):
    r=requests.get(PROJECT+"/rest/v1/"+table,params=params,headers=headers(),timeout=20)
    require(r.ok,"canonical_read_failed")
    return r.json()

def one(table, params):
    r=rows(table,{**params,"limit":2})
    require(len(r)==1,"canonical_identity_not_unique")
    return r[0]

def scope():
    req=one("production_requests",{"airtable_record_id":"eq."+REQUEST,"select":"id,request_status,master_asset_status,output_plan_status,variant_status,publish_status,variant_manifest"})
    parent=one("content_items",{"airtable_record_id":"eq."+PARENT,"select":"id,content_number,production_request_id"})
    d=req.get("publish_status") or {}
    m=req.get("variant_manifest") or {}
    require(req["request_status"] in ("Submitted","Promoted") and parent["content_number"]==2324 and parent["production_request_id"]==req["id"]
        and req["master_asset_status"]==req["output_plan_status"]==req["variant_status"]=="Ready"
        and m.get("ready_count")==m.get("target_count")==6
        and d.get("Selected_Music_Asset")==[MUSIC] and d.get("Background_Music_Mode")=="Yes","request_identity_or_intent_changed")
    return req["id"],parent["id"]

def main():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    if not os.getenv("PORT","").strip():os.environ["PORT"]="3350"
    sys.path.insert(0,str(BASE))
    require(os.environ["SUPABASE_URL"].rstrip("/")==PROJECT,"wrong_project")
    from studio_produce.workload_governor import enabled,resource_slot,recovery_read_only_active,circuit_open
    from integrations.google_drive import GoogleDriveClient
    from audio.voiceover_duration import probe_audio_duration_bytes
    require(enabled() and not recovery_read_only_active() and not circuit_open(),"governor_unavailable")
    h=requests.get("http://127.0.0.1:3350/health",timeout=15).json()
    require(h.get("ok") is True and h.get("studio_write_source")=="supabase" and h.get("supabase_pipeline_writes") is True,"canonical_runner_unavailable")
    with resource_slot("recovery_media_stage",key="buckingham-c2324-music-duration",limit=1,wait_seconds=0):
        identity=scope()
        params={"airtable_record_id":"eq."+MUSIC,"select":"id,airtable_record_id,asset_role,media_class,asset_status,active,do_not_use,google_drive_file_id,metadata,updated_at"}
        a=one("media_assets",params); meta=a["metadata"]
        require(a["asset_role"]=="Music" and a["media_class"]=="Audio" and a["asset_status"]=="Available" and a["active"] is True and a["do_not_use"] is False and a["google_drive_file_id"]==DRIVE,"asset_identity_changed")
        require(meta.get("rights_status") in ("Owned","Licensed","Public Domain") and not meta.get("exclusion_reasons"),"asset_catalog_not_eligible")
        data,mime=GoogleDriveClient().download_file(DRIVE)
        require(str(mime).startswith("audio/") and 1000<len(data)<=40*1024*1024,"invalid_audio_bytes")
        seconds=probe_audio_duration_bytes(data)
        require(math.isfinite(seconds) and 0<seconds<=43200,"duration_invalid")
        require(scope()==identity and one("media_assets",params)==a,"canonical_revision_changed")
        # Compare and set exact asset revision; never change rights, identity, or source.
        if not meta.get("duration_seconds"):
            patch={**meta,"duration_seconds":seconds,"music_duration_probe_v1":{"sha256":hashlib.sha256(data).hexdigest(),"duration_seconds":seconds,"method":"ffprobe","drive_file_id":DRIVE}}
            res=requests.patch(PROJECT+"/rest/v1/media_assets",params={"id":"eq."+a["id"],"updated_at":"eq."+a["updated_at"],"google_drive_file_id":"eq."+DRIVE,"metadata->>duration_seconds":"is.null"},headers={**headers(),"Prefer":"return=representation"},json={"metadata":patch},timeout=20)
            require(res.ok and len(res.json())==1,"duration_compare_and_set_not_committed")
        fresh=one("media_assets",params)
        require(abs(float(fresh["metadata"]["duration_seconds"])-seconds)<0.1,"canonical_duration_readback_mismatch")
        print("C2324_MUSIC_DURATION="+json.dumps({"verified":True,"content":2324,"music_asset":MUSIC,"seconds":seconds,"sha256":hashlib.sha256(data).hexdigest(),"provider_writes":0,"production_writes":0}),flush=True)

if __name__=="__main__":
    main()
