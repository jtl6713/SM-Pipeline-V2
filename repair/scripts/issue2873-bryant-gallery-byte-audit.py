"""Exact, bounded read-only Bryant Park image audit after producer geometry block."""
import hashlib
import io
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
REQUEST = "recbD8PLtJpez8Oz0"
PARENT = "recAdmlLzSJPnhoMf"
COVER = "1EQg6scYpHXDtAqCcxan5tRYjo3TU1-mR"
SOURCES = {
    "recVxGGFnQO5noP8i": "13ELDNOxKJRIV4h45u3myz1AHXnpDqwj9",
    "rec5t17N0RS3lNihc": "1e8W8DswoaFkzk2KcX8YYz8nC5pTlVSkN",
    "recFn7GdWdVlyjyMp": "1DaKqoiZAj0MTX9Yh5lt39aZoEIca161m",
    "recz7AH3pzGSCAOF6": "1XStiVgZ6SXzqnqmSJ_yqQ5fO_v_83xF9",
}
BASE = Path.cwd() / "Services" / "pipeline-runner" / "service"


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def get(table, params):
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    response = requests.get(PROJECT+"/rest/v1/"+table, params=params,
        headers={"apikey":key,"Authorization":"Bearer "+key},timeout=20)
    require(response.ok,"canonical_read_failed_"+table)
    rows=response.json()
    require(isinstance(rows,list),"canonical_response_invalid_"+table)
    return rows


def probe(data):
    from PIL import Image, ImageOps
    require(isinstance(data,bytes) and 0<len(data)<=16*1024*1024,"image_byte_budget_exceeded")
    with Image.open(io.BytesIO(data)) as source:
        fmt=source.format
        size=source.size
        source.verify()
    with Image.open(io.BytesIO(data)) as source:
        orientation=source.getexif().get(274,1)
        corrected=ImageOps.exif_transpose(source)
        corrected.load()
        oriented=corrected.size
    return {"format":fmt,"width":size[0],"height":size[1],"orientation":orientation,
            "oriented_width":oriented[0],"oriented_height":oriented[1],
            "sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)}


def main():
    require((BASE/".env").is_file(),"runner_env_missing")
    load_dotenv(BASE/".env",override=False)
    if not os.getenv("PORT","").strip(): os.environ["PORT"]="3350"
    require(os.environ.get("SUPABASE_URL","").rstrip("/")==PROJECT,"wrong_project")
    sys.path.insert(0,str(BASE))
    from integrations.google_drive import GoogleDriveClient
    from studio_produce import native_gallery as gallery, workload_governor as g
    require(g.enabled() and not g.recovery_read_only_active() and not g.circuit_open(),"governor_unavailable")
    before=g.snapshot()
    require(before.get("database_circuit_phase")=="closed" and before.get("max_jobs")==1
        and before.get("active_jobs")==0 and before.get("queued_jobs")==0
        and before.get("active_worker_heavy")==0,"runner_not_idle")
    req=get("production_requests",{"airtable_record_id":"eq."+REQUEST,
        "select":"promoted_content_item_id,variant_status,production_job","limit":2})
    require(len(req)==1 and req[0]["variant_status"]=="Ready"
        and req[0]["production_job"].get("step")=="blocked"
        and req[0]["production_job"].get("error")=="Native gallery image geometry mismatch","request_revision_changed")
    parents=get("content_items",{"airtable_record_id":"eq."+PARENT,"select":"id,extras","limit":2})
    require(len(parents)==1 and parents[0]["id"]==req[0]["promoted_content_item_id"]
        and parents[0]["extras"].get("Thumbnail_Google_Drive_File_ID")==COVER,"cover_identity_changed")
    crops=get("studio_media_transfer_queue",{"payload->>production_request_record_id":"eq."+REQUEST,
        "payload->>aspect_ratio":"eq.4:5","status":"eq.Ready","select":"payload","limit":5})
    require(len(crops)==4 and {r["payload"]["media_asset_record_id"]:r["payload"]["drive_file_id"] for r in crops}==SOURCES,
        "crop_identity_changed")
    drive=GoogleDriveClient()
    for label,file_id in [("cover",COVER),*SOURCES.items()]:
        with g.resource_slot("transfer",key="issue2873-readonly-"+label,limit=1):
            data,mime=drive.download_file(file_id,timeout=30)
            result=probe(data)
            result.update(label=label,drive_mime=mime)
            if label=="cover":
                result["normalized"]=probe(gallery._cover_jpeg(data))
            else:
                try:
                    gallery._image_proof(data)
                    result["producer_source_proof"]="PASS"
                except RuntimeError as error:
                    result["producer_source_proof"]=str(error)
            print("BRYANT_IMAGE_AUDIT="+json.dumps(result,separators=(",",":")),flush=True)
    print("BRYANT_IMAGE_AUDIT_COMPLETE=5_NO_CANONICAL_OR_PROVIDER_WRITES",flush=True)


if __name__=="__main__":
    main()
