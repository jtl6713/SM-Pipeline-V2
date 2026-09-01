from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from typing import Any

from airtable.constants import MEDIA_ASSETS_TABLE, PRODUCTION_REQUESTS_TABLE

VIDEO_MASTER_EXTENSIONS = {"mp4", "mov", "m4v", "webm", "quicktime"}


def is_video_preview_row(fields: dict[str, Any] | None) -> bool:
    fields = fields or {}
    ext = str(fields.get("Source_Extension") or "").strip().lower().lstrip(".")
    mime = str(fields.get("Source_MIME_Type") or "").strip().lower()
    name = str(fields.get("Source_Name") or fields.get("Target_File_Name") or "").strip().lower()
    return (
        ext in VIDEO_MASTER_EXTENSIONS
        or mime.startswith("video/")
        or name.endswith(tuple(f".{item}" for item in VIDEO_MASTER_EXTENSIONS))
    )


def ffmpeg_poster_frame(source_bytes: bytes, ext: str) -> bytes | None:
    suffix = f".{str(ext or 'mov').lstrip('.') or 'mov'}"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, f"clip{suffix}")
            out = os.path.join(tmp, "frame.jpg")
            with open(src, "wb") as handle:
                handle.write(source_bytes)
            completed = subprocess.run(
                ["ffmpeg", "-y", "-ss", "0.25", "-i", src, "-frames:v", "1", "-q:v", "3", out],
                check=False,
                capture_output=True,
                timeout=60,
            )
            if completed.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) < 80:
                return None
            with open(out, "rb") as handle:
                return handle.read()
    except Exception:
        return None


def clip_poster_bytes(drive: Any, drive_id: str, ext: str) -> tuple[bytes, str]:
    getter = getattr(drive, "download_thumbnail", None)
    if callable(getter):
        thumb = getter(drive_id)
        if thumb and thumb[0]:
            return thumb[0], thumb[1] if len(thumb) > 1 else "image/jpeg"
    source_bytes, _mime = drive.download_file(drive_id)
    frame = ffmpeg_poster_frame(source_bytes, ext)
    if not frame:
        raise RuntimeError("Could not extract a JPEG frame from this clip")
    return frame, "image/jpeg"


def stamp_request_clip_poster(
    client: Any,
    production_request_id: str,
    source_asset_id: str,
    preview_url: str,
    preview_key: str,
) -> None:
    if not production_request_id or not source_asset_id or not preview_url:
        return
    record = client.get_record(PRODUCTION_REQUESTS_TABLE, production_request_id)
    raw = (record.get("fields") or {}).get("Studio_Master_Assets_JSON") or "[]"
    try:
        assets = json.loads(raw) if isinstance(raw, str) else list(raw or [])
    except Exception:
        return
    next_assets = []
    changed = False
    for asset in assets if isinstance(assets, list) else []:
        if not isinstance(asset, dict):
            next_assets.append(asset)
            continue
        if str(asset.get("id") or "") == str(source_asset_id):
            next_assets.append({**asset, "poster_url": preview_url, "poster_r2_key": preview_key})
            changed = True
        else:
            next_assets.append(asset)
    if changed:
        client.update_record(
            PRODUCTION_REQUESTS_TABLE,
            production_request_id,
            {"Studio_Master_Assets_JSON": json.dumps(next_assets)},
        )


def is_video_master_asset(asset: dict[str, Any] | None) -> bool:
    asset = asset or {}
    kind = str(asset.get("media_kind") or "").strip().lower()
    if kind == "video":
        return True
    if kind in {"photo", "image"}:
        return False
    mime = str(asset.get("mime_type") or "").lower()
    name = str(asset.get("name") or "").lower()
    return mime.startswith("video/") or name.endswith(tuple(f".{item}" for item in VIDEO_MASTER_EXTENSIONS if item != "quicktime"))


def looks_like_clip_poster_url(url: str | None) -> bool:
    raw = str(url or "").strip()
    if not raw or raw.startswith("blob:"):
        return False
    if re.search(r"\.(mp4|mov|m4v|webm)(\?|#|$)", raw, re.I):
        return False
    if "/studio/previews/clip-posters/" in raw:
        return True
    return bool(re.search(r"\.(jpe?g|png|webp|gif)(\?|#|$)", raw, re.I))


def clip_poster_r2_key(production_request_id: str, asset_id: str) -> str:
    return f"studio/previews/clip-posters/{production_request_id}/{asset_id}.jpg"


def asset_clip_extension(asset: dict[str, Any] | None) -> str:
    asset = asset or {}
    name = str(asset.get("name") or "")
    mime = str(asset.get("mime_type") or "").lower()
    if "." in name:
        return name.rsplit(".", 1)[-1].lower().lstrip(".") or "mov"
    if "quicktime" in mime:
        return "mov"
    if mime.startswith("video/"):
        return mime.split("/", 1)[-1] or "mp4"
    return "mov"


def resolve_asset_drive_id(client: Any, asset: dict[str, Any] | None) -> str:
    asset = asset or {}
    drive_id = str(asset.get("google_drive_file_id") or "").strip()
    if drive_id:
        return drive_id
    media_id = str(asset.get("media_asset_record_id") or "").strip()
    if not media_id or client is None:
        return ""
    record = client.get_record(MEDIA_ASSETS_TABLE, media_id)
    fields = record.get("fields") or {}
    return str(fields.get("Google Drive File ID") or "").strip()


def ensure_request_clip_posters(
    client: Any,
    production_request_id: str,
    *,
    source_asset_id: str = "",
    drive: Any = None,
    r2: Any = None,
) -> dict[str, Any]:
    record_id = str(production_request_id or "").strip()
    if not record_id:
        raise ValueError("production_request_record_id is required")
    if client is None:
        from airtable.client import AirtableClient

        client = AirtableClient()
    record = client.get_record(PRODUCTION_REQUESTS_TABLE, record_id)
    raw = (record.get("fields") or {}).get("Studio_Master_Assets_JSON") or "[]"
    try:
        assets = json.loads(raw) if isinstance(raw, str) else list(raw or [])
    except Exception:
        assets = []
    wanted = str(source_asset_id or "").strip()
    targets: list[dict[str, Any]] = []
    for asset in assets if isinstance(assets, list) else []:
        if not isinstance(asset, dict) or not is_video_master_asset(asset):
            continue
        if wanted and str(asset.get("id") or "") != wanted:
            continue
        if looks_like_clip_poster_url(str(asset.get("poster_url") or "")):
            continue
        targets.append(asset)
    if not targets:
        return {"ok": True, "posters": [], "errors": [], "already_ready": True}

    if drive is None:
        from integrations.google_drive import GoogleDriveClient

        drive = GoogleDriveClient()
    if r2 is None:
        from integrations.r2_upload import R2UploadClient
        from item4.settings import pipeline_settings

        r2 = R2UploadClient(pipeline_settings(client))

    posters: list[dict[str, str]] = []
    errors: list[str] = []
    for asset in targets:
        asset_id = str(asset.get("id") or "").strip()
        label = str(asset.get("name") or asset_id or "clip")
        drive_id = resolve_asset_drive_id(client, asset)
        if not asset_id or not drive_id:
            errors.append(f"{label} is not in Google Drive yet")
            continue
        try:
            frame, content_type = clip_poster_bytes(drive, drive_id, asset_clip_extension(asset))
            key = clip_poster_r2_key(record_id, asset_id)
            r2.put_object(key, frame, content_type or "image/jpeg")
            url = r2.preview_url(key)
            stamp_request_clip_poster(client, record_id, asset_id, url, key)
            posters.append({"source_asset_id": asset_id, "poster_url": url, "poster_r2_key": key})
        except Exception as exc:
            errors.append(f"{label}: {exc}")
    if not posters and errors:
        raise RuntimeError(errors[0])
    return {"ok": True, "posters": posters, "errors": errors, "already_ready": False}
