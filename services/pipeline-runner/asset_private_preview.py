"""Exact five-asset private thumbnail transport for issue #3030.

The caller supplies only a Studio asset record ID; the runner independently
checks canonical identity and downloads via its established Drive OAuth.
No arbitrary Drive proxy, public sharing, provider action, or database write.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import threading
import time
from dataclasses import dataclass

import requests
from flask import Blueprint, Response, jsonify, request
from PIL import Image, ImageOps

PROJECT = "https://vkwvscgisqsbuwagdvtb.supabase.co"
PROFILE = "recpNlNn6U6eq0M9r"
MAX_SOURCE = 3_500_000
MAX_THUMB = 800_000
MAX_PIXELS = 20_000_000
CACHE_SECONDS = 300
SLOT = threading.Lock()

@dataclass(frozen=True)
class Source:
    file_id: str
    size: int

SPECS = {
    "recLCL4QBOuOEJ1s4": Source("1C_6XNcEvQugrSDqZUj0c5FYrctB29Qz7", 2669428),
    "rec9eKU4Asdo2jyx3": Source("1IM1_5lO-5clkGYNLHeO_9DEMwRHMSc5Z", 2357679),
    "recdAAkJ6fRrNY9el": Source("10htxPjKxCFYqbFlSORFb2vh1N72s1rjq", 2382870),
    "recbetLNTbLcxWcMJ": Source("1Iqax5ClaweTt6-vIk99ukw2hvR2CJPIZ", 2072774),
    "reclA5AWAy0UWCx6f": Source("1NCxVWT39iOle1nZFnlG1FPGBI-jiZmeF", 2299565),
}
SELECT = ("airtable_record_id,asset_status,active,do_not_use,media_class,"
          "mime_type,file_size_bytes,google_drive_file_id,metadata")

def read_row(settings, asset_id):
    url = str(settings.get("supabase_url") or "").rstrip("/")
    key = str(settings.get("supabase_service_role_key") or "").strip()
    if url != PROJECT or not key or settings.get("studio_write_source") != "supabase":
        raise ValueError("canonical_authority_unavailable")
    with requests.get(url + "/rest/v1/media_assets", params={
        "airtable_record_id": "eq." + asset_id, "select": SELECT, "limit": 2,
    }, headers={"apikey":key,"Authorization":"Bearer "+key},
        timeout=(5,15), allow_redirects=False) as response:
        if response.status_code != 200:
            raise ValueError("canonical_read_failed")
        rows = response.json()
    return rows[0] if isinstance(rows,list) and len(rows)==1 else None

def eligible(row, asset_id, source):
    if not isinstance(row,dict) or row.get("airtable_record_id") != asset_id:
        return False
    metadata = row.get("metadata")
    return (isinstance(metadata,dict)
        and row.get("active") is True and row.get("do_not_use") is False
        and row.get("asset_status") == "Available" and row.get("media_class") == "Image"
        and row.get("mime_type") == "image/png"
        and row.get("google_drive_file_id") == source.file_id
        and row.get("file_size_bytes") == source.size
        and metadata.get("content_profile_airtable_id") == PROFILE
        and str(metadata.get("studio_transfer_id") or "").startswith("ITEM4-MASTER-"))

def download_source(source):
    from integrations.google_drive import GoogleDriveClient
    if not 24 <= source.size <= MAX_SOURCE:
        raise ValueError("source_size_unbounded")
    token = GoogleDriveClient().access_token()
    url = "https://www.googleapis.com/drive/v3/files/" + source.file_id
    headers = {"Authorization":"Bearer "+token}
    def metadata():
        with requests.get(url, params={"fields":"id,size,mimeType,md5Checksum,trashed,version",
            "supportsAllDrives":"true"}, headers={**headers,"Accept":"application/json"},
            timeout=(5,15),allow_redirects=False) as response:
            if response.status_code != 200:
                raise ValueError("source_metadata_unavailable")
            row=response.json()
        checksum=str(row.get("md5Checksum") or "")
        version=str(row.get("version") or "")
        if (row.get("id") != source.file_id or str(row.get("size")) != str(source.size)
            or row.get("mimeType") != "image/png" or row.get("trashed") is not False
            or len(checksum)!=32 or not version):
            raise ValueError("source_metadata_changed")
        return checksum,version
    before=metadata()
    with requests.get(url,params={"alt":"media","supportsAllDrives":"true"},
        headers={**headers,"Accept":"image/png,application/octet-stream"},
        timeout=(10,30),stream=True,allow_redirects=False) as response:
        if response.status_code != 200:
            raise ValueError("source_http_failed")
        mime=(response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if mime not in ("image/png","application/octet-stream"):
            raise ValueError("source_mime_invalid")
        data=bytearray()
        for chunk in response.iter_content(128*1024):
            if len(data)+len(chunk)>source.size:
                raise ValueError("source_size_changed")
            data.extend(chunk)
    if len(data)!=source.size or hashlib.md5(data,usedforsecurity=False).hexdigest()!=before[0] or metadata()!=before:
        raise ValueError("source_bytes_changed")
    return bytes(data)

def make_thumbnail(data):
    if not isinstance(data,bytes) or not 24 <= len(data) <= MAX_SOURCE:
        raise ValueError("invalid_source")
    with Image.open(io.BytesIO(data)) as check:
        if check.format!="PNG" or check.width*check.height>MAX_PIXELS:
            raise ValueError("invalid_source_image")
        check.verify()
    with Image.open(io.BytesIO(data)) as im:
        im=ImageOps.exif_transpose(im)
        im.thumbnail((720,720),Image.Resampling.LANCZOS)
        rgba=im.convert("RGBA")
        canvas=Image.new("RGB",rgba.size,"white")
        canvas.paste(rgba,mask=rgba.getchannel("A"))
        out=io.BytesIO()
        canvas.save(out,"JPEG",quality=85,optimize=True)
    result=out.getvalue()
    if not 24 <= len(result) <= MAX_THUMB:
        raise ValueError("thumbnail_size_invalid")
    return result

def create_asset_private_preview_blueprint(settings, *, reader=read_row, downloader=download_source, thumbnailer=make_thumbnail):
    bp=Blueprint("asset_private_preview_source",__name__)
    cache={}
    def denied(status,code):
        return jsonify(ok=False,error=code),status,{"Cache-Control":"private, no-store"}

    @bp.get("/jobs/assets/private-preview-source/<asset_id>")
    def source_preview(asset_id):
        secret=str(settings.get("pipeline_runner_shared_secret") or "").strip()
        supplied=request.headers.get("X-Pipeline-Secret","")
        if len(secret)<24 or not supplied or not hmac.compare_digest(secret,supplied):
            return denied(401,"asset_preview_auth_required")
        source=SPECS.get(asset_id)
        if not source or request.query_string or request.headers.get("Range") or request.method!="GET":
            return denied(404,"asset_preview_exact_asset_required")
        if not SLOT.acquire(timeout=8):
            return denied(429,"asset_preview_source_busy")
        try:
            if not eligible(reader(settings,asset_id),asset_id,source):
                cache.pop(asset_id,None)
                return denied(409,"asset_preview_source_changed")
            cached=cache.get(asset_id)
            if cached and cached[0]>time.monotonic():
                thumb=cached[1]
            else:
                original=downloader(source)
                if not isinstance(original,bytes) or len(original)!=source.size:
                    return denied(409,"asset_preview_source_bytes_changed")
                thumb=thumbnailer(original)
                if not isinstance(thumb,bytes) or not 24<=len(thumb)<=MAX_THUMB or not thumb.startswith(b"\xff\xd8\xff") or not thumb.endswith(b"\xff\xd9"):
                    return denied(409,"asset_preview_thumbnail_invalid")
                if not eligible(reader(settings,asset_id),asset_id,source):
                    return denied(409,"asset_preview_source_changed")
                cache[asset_id]=(time.monotonic()+CACHE_SECONDS,thumb)
            return Response(thumb,status=200,headers={
                "Content-Type":"image/jpeg","Content-Length":str(len(thumb)),
                "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
                "X-Asset-Preview-Record":asset_id,
                "X-Asset-Preview-Source-Id":source.file_id,
                "X-Asset-Preview-Source-Bytes":str(source.size),
                "X-Asset-Preview-Sha256":hashlib.sha256(thumb).hexdigest(),
            })
        except Exception:
            return denied(503,"asset_preview_source_unavailable")
        finally:
            SLOT.release()
    return bp
