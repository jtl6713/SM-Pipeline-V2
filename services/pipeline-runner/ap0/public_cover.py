"""Stage the 3D cover onto the public publish bucket Graph/YouTube can fetch.

Drive `uc?id=` and `webContentLink` URLs are not reliable cover_url sources.
Instagram also prefers cover_url without a competing thumb_offset.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import parse_qs, urlparse

from ap0.constants import PUBLIC_MEDIA_BASE, R2_KEY_PREFIX
from ap0.public_mp4 import is_public_publish_url
from render.fields import field, field_str

DRIVE_ID_RE = re.compile(r"(?:/d/|/file/d/)([A-Za-z0-9_-]{10,})")
IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def output_id_token(record: dict[str, Any]) -> str:
    return str(field(record, "Output_ID") or "").strip()


def looks_like_image_url(url: str) -> bool:
    path = urlparse(str(url or "")).path.lower()
    if path.endswith(IMAGE_SUFFIXES):
        return True
    return "/thumbnails/" in path or "/cover." in path


def graph_fetchable_cover_url(url: str) -> str:
    href = str(url or "").strip()
    if not is_public_publish_url(href):
        return ""
    if not looks_like_image_url(href):
        return ""
    return href


def drive_file_id_from_url(url: str) -> str:
    href = str(url or "").strip()
    if not href:
        return ""
    match = DRIVE_ID_RE.search(href)
    if match:
        return match.group(1)
    query = parse_qs(urlparse(href).query)
    for key in ("id", "ids"):
        values = query.get(key) or []
        if values and re.fullmatch(r"[A-Za-z0-9_-]{10,}", values[0]):
            return values[0]
    return ""


def cover_source_drive_id(record: dict[str, Any]) -> str:
    return field_str(record, "Thumbnail_Google_Drive_File_ID") or drive_file_id_from_url(
        field_str(record, "Thumbnail_URL")
    )


def cover_needs_public_stage(record: dict[str, Any]) -> bool:
    if graph_fetchable_cover_url(field_str(record, "Thumbnail_URL")):
        return False
    return bool(field_str(record, "Thumbnail_URL") or cover_source_drive_id(record))


def cover_r2_key(record: dict[str, Any], ext: str = "png") -> str:
    suffix = str(ext or "png").lstrip(".").lower() or "png"
    token = output_id_token(record) or "unknown"
    return f"{R2_KEY_PREFIX}/platform-output-{token}/cover.{suffix}"


def cover_public_url(record: dict[str, Any], ext: str = "png") -> str:
    return f"{PUBLIC_MEDIA_BASE}/{cover_r2_key(record, ext)}"


def _ext_for_mime(mime: str, fallback_url: str = "") -> str:
    kind = str(mime or "").split(";")[0].strip().lower()
    if kind in {"image/jpeg", "image/jpg"}:
        return "jpg"
    if kind == "image/webp":
        return "webp"
    if kind == "image/gif":
        return "gif"
    if kind == "image/png":
        return "png"
    path = urlparse(fallback_url).path.lower()
    for suffix in IMAGE_SUFFIXES:
        if path.endswith(suffix):
            return "jpg" if suffix == ".jpeg" else suffix.lstrip(".")
    return "png"


def download_cover_bytes(client, record: dict[str, Any]) -> tuple[bytes, str]:
    import requests

    from integrations.google_drive import GoogleDriveClient

    drive_id = cover_source_drive_id(record)
    if drive_id:
        content, mime = GoogleDriveClient().download_file(drive_id)
        return content, mime or "image/png"
    url = field_str(record, "Thumbnail_URL")
    if not url.startswith("https://"):
        raise RuntimeError("No public or Drive thumbnail to stage as a native cover")
    response = requests.get(url, timeout=60)
    if not response.ok or not response.content:
        raise RuntimeError(f"Cover download failed HTTP {response.status_code}")
    mime = response.headers.get("Content-Type", "image/png").split(";")[0].strip()
    return response.content, mime or "image/png"


def ensure_public_cover_url(client, record: dict[str, Any]) -> str:
    from integrations.r2_upload import R2UploadClient

    existing = graph_fetchable_cover_url(field_str(record, "Thumbnail_URL"))
    if existing:
        return existing
    if not cover_needs_public_stage(record):
        return ""
    content, mime = download_cover_bytes(client, record)
    ext = _ext_for_mime(mime, field_str(record, "Thumbnail_URL"))
    key = cover_r2_key(record, ext)
    public = f"{PUBLIC_MEDIA_BASE}/{key}"
    R2UploadClient().put_object(key, content, mime or "image/png")
    if record.get("id") and public != field_str(record, "Thumbnail_URL"):
        from airtable.constants import PLATFORM_OUTPUTS_TABLE

        client.update_record(PLATFORM_OUTPUTS_TABLE, record["id"], {"Thumbnail_URL": public}, typecast=True)
        fields = record.setdefault("fields", {})
        fields["Thumbnail_URL"] = public
    return public
