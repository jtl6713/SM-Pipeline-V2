from __future__ import annotations

import json
import os
import subprocess
import tempfile
from typing import Any

from airtable.constants import PRODUCTION_REQUESTS_TABLE

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
