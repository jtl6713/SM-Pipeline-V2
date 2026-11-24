"""Bounded QA-native still rebuild. Only immutable CDN output bytes are written.
The authenticated Worker owns canonical selection, approval lock and CAS.
"""
from __future__ import annotations
import hashlib
import io
import re
import time
import requests
from PIL import Image, ImageOps
from integrations.google_drive import GoogleDriveClient
from integrations.r2_upload import R2UploadClient
from studio_produce import workload_governor

REC = re.compile(r"rec[A-Za-z0-9]{14}")
TOKEN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
SHA = re.compile(r"[a-f0-9]{64}")
BASE = "https://media.chicagoshining.com/"
SOURCE = re.compile(r"https://media\.chicagoshining\.com/studio/previews/repairs/issue[0-9]+/[A-Za-z0-9_-]+/slide-[0-9]+-([a-f0-9]{16})\.jpg")
WATERMARK_ID = "1WQyd5W1__HkaEkWyC38IMErW8702Rd4u"
WATERMARK_SHA = "2199893b2668e976e350631e5386e33aece14d0b96a77907538ab67bbf50b344"
MAX_BYTES = 8 * 1024 * 1024


def validate(payload):
    if not isinstance(payload, dict) or set(payload) != {
        "output","record_id","target_version","source_output","source_version","idea_id","token","assets"
    }:
        raise ValueError("invalid_rebuild_request")
    for k in ("record_id","idea_id"):
        if not isinstance(payload[k], str) or not REC.fullmatch(payload[k]):
            raise ValueError("invalid_rebuild_identity")
    if not isinstance(payload["token"], str) or not TOKEN.fullmatch(payload["token"]):
        raise ValueError("invalid_rebuild_token")
    for k in ("output","source_output"):
        if type(payload[k]) is not int or not 0 < payload[k] < 100000000:
            raise ValueError("invalid_output_number")
    if payload["output"] == payload["source_output"]:
        raise ValueError("same_output")
    for k in ("target_version","source_version"):
        if not isinstance(payload[k],str) or not 10 <= len(payload[k]) <= 48:
            raise ValueError("invalid_revision")
    assets = payload["assets"]
    if not isinstance(assets,list) or not 2 <= len(assets) <= 8:
        raise ValueError("invalid_asset_count")
    seen = set()
    for i,a in enumerate(assets,1):
        if not isinstance(a,dict) or set(a) != {"index","media_asset_id","asset_name","drive_id","transfer_id","source_url","source_hash_prefix","branded_url","branded_sha256"}:
            raise ValueError("invalid_asset")
        if a["index"] != i or not REC.fullmatch(str(a["media_asset_id"])) or a["media_asset_id"] in seen:
            raise ValueError("invalid_ordered_asset")
        seen.add(a["media_asset_id"])
        for k in ("asset_name","drive_id","transfer_id"):
            if not isinstance(a[k],str) or not 1 <= len(a[k]) <= 256:
                raise ValueError("invalid_source_identity")
        m = SOURCE.fullmatch(str(a["source_url"]))
        if not m or m[1] != a["source_hash_prefix"] or not SHA.fullmatch(str(a["branded_sha256"])):
            raise ValueError("invalid_source_hash")
        expected = a["source_url"].rsplit("/",1)[0]+f"/shared-small-bottom-right/slide-{i:02d}-{a['branded_sha256'][:16]}.jpg"
        if a["branded_url"] != expected:
            raise ValueError("invalid_branded_source")


def download(url, expected, geometry, *, prefix=False):
    with requests.get(url, stream=True, timeout=(5,10), allow_redirects=False, headers={"Cache-Control":"no-cache"}) as res:
        if res.status_code != 200 or res.headers.get("Content-Type","").split(";")[0].lower() != "image/jpeg":
            raise RuntimeError("source_media_unavailable")
        chunks = bytearray()
        for chunk in res.iter_content(65536):
            chunks.extend(chunk)
            if len(chunks) > MAX_BYTES:
                raise RuntimeError("image_budget_exceeded")
        data = bytes(chunks)
    digest = hashlib.sha256(data).hexdigest()
    if (not digest.startswith(expected) if prefix else digest != expected):
        raise RuntimeError("source_hash_mismatch")
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG" or image.size != geometry:
            raise RuntimeError("source_geometry_mismatch")
        image.verify()
    return data,digest


def compose(data, watermark, geometry=(1080,1920)):
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "JPEG" or image.size != (1080,1350):
            raise RuntimeError("invalid_base_geometry")
        if geometry == (1080,1350):
            canvas=image.convert("RGBA")
        elif geometry == (1080,1920):
            # Preserve complete approved subject, avoid cropping landmarks.
            photo=ImageOps.contain(image.convert("RGB"),geometry,Image.Resampling.LANCZOS)
            canvas=Image.new("RGBA",geometry,(0,0,0,255))
            canvas.paste(photo,((geometry[0]-photo.width)//2,(geometry[1]-photo.height)//2))
        else:
            raise RuntimeError("invalid_target_geometry")
    width=round(1080*0.12)
    mark=watermark.resize((width,round(watermark.height*width/watermark.width)),Image.Resampling.LANCZOS)
    xy=(1080-30-mark.width,geometry[1]-30-mark.height)
    layer=Image.new("RGBA",canvas.size,(0,0,0,0))
    layer.paste(mark,xy)
    canvas=Image.alpha_composite(canvas,layer)
    out=io.BytesIO()
    canvas.convert("RGB").save(out,format="JPEG",quality=95,optimize=True,subsampling=0)
    return out.getvalue()


def stage(payload, *, drive=None, uploader=None, read=download, renew=None):
    validate(payload)
    renew=renew or workload_governor.renew_worker_heavy
    started=time.monotonic()
    def fence():
        if time.monotonic()-started>95 or not renew(payload["idea_id"],payload["token"]):
            raise RuntimeError("rebuild_lease_or_budget_lost")
    fence()
    drive=drive or GoogleDriveClient()
    uploader=uploader or R2UploadClient()
    data,mime=drive.download_file(WATERMARK_ID)
    if mime!="image/png" or len(data)!=2075758 or hashlib.sha256(data).hexdigest()!=WATERMARK_SHA:
        raise RuntimeError("watermark_identity_changed")
    with Image.open(io.BytesIO(data)) as img:
        if img.mode!="RGBA" or img.size!=(1024,1536):
            raise RuntimeError("watermark_geometry_changed")
        mark=img.copy()
    assets=[]
    for a in payload["assets"]:
        fence()
        read(a["branded_url"],a["branded_sha256"],(1080,1350))
        original,source_sha=read(a["source_url"],a["source_hash_prefix"],(1080,1350),prefix=True)
        # Reproduce the already approved 4:5 hash from the exact unbranded
        # bytes and pinned watermark. A matching short URL slug alone is not
        # sufficient evidence of source identity.
        if hashlib.sha256(compose(original,mark,(1080,1350))).hexdigest()!=a["branded_sha256"]:
            raise RuntimeError("source_lineage_reproduction_failed")
        built=compose(original,mark)
        sha=hashlib.sha256(built).hexdigest()
        key=f"studio/previews/watermarked/quality-native-rebuild/{payload['record_id']}/slide-{a['index']:02d}-{sha}.jpg"
        fence()
        uploader.put_object(key,built,"image/jpeg")
        read(BASE+key,sha,(1080,1920))
        fence()
        assets.append({**a,"source_sha256":source_sha,"sha256":sha,"geometry":"1080x1920","url":BASE+key,"cdn_verified":True})
    return {"verified":True,"output":payload["output"],"source_output":payload["source_output"],
            "target_version":payload["target_version"],"source_version":payload["source_version"],
            "source_writes":0,"provider_writes":0,"assets":assets}
