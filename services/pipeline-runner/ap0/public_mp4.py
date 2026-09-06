"""Stage a final MP4 onto the public publish bucket Graph and TikTok can fetch.

`studio/master-assets/` lives on the private STUDIO_MEDIA bucket. The
media.chicagoshining.com host is chicagoshining-publish-assets, so those keys 404.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ap0.constants import CONTENT_TYPE, PUBLIC_MEDIA_BASE
from item4.constants import STUDIO_MASTER_PREFIX
from render.fields import field_str


def _is_studio_master_key(r2_key: str) -> bool:
    return str(r2_key or "").strip().startswith(STUDIO_MASTER_PREFIX)


def is_public_publish_url(url: str) -> bool:
    href = str(url or "").strip()
    prefix = f"{PUBLIC_MEDIA_BASE}/"
    if not href.startswith(prefix):
        return False
    path = href[len(prefix) :]
    return path.startswith("publish/") or path.startswith("studio/previews/")


def master_r2_key_from_url(url: str) -> str:
    href = str(url or "").strip()
    if not href:
        return ""
    if _is_studio_master_key(href):
        return href
    parsed = urlparse(href)
    path = str(parsed.path or "").lstrip("/")
    return path if _is_studio_master_key(path) else ""


def master_r2_key_from_record(record: dict[str, Any]) -> str:
    for name in ("Publish_Asset_URL", "Final_File_URL", "Clip_1_URL", "Studio_Preview_URL"):
        key = master_r2_key_from_url(field_str(record, name))
        if key:
            return key
    return ""


def download_mp4_bytes(client, record: dict[str, Any]) -> bytes:
    from item4.settings import PipelineSettings
    from item4.sources import download_via_media_bridge
    from integrations.google_drive import GoogleDriveClient

    drive_id = field_str(record, "Final_File_ID")
    if drive_id:
        content, _mime = GoogleDriveClient().download_file(drive_id)
        return content
    key = master_r2_key_from_record(record)
    if not key:
        raise RuntimeError("No Drive Final_File_ID or studio/master-assets key to stage")
    content, _mime = download_via_media_bridge(key, PipelineSettings(client))
    return content


def ensure_public_mp4_url(client, record: dict[str, Any], plan: dict[str, str]) -> str:
    from integrations.r2_upload import R2UploadClient

    existing = field_str(record, "Publish_Asset_URL")
    if is_public_publish_url(existing):
        return existing
    content = download_mp4_bytes(client, record)
    R2UploadClient().put_object(plan["r2_object_key"], content, CONTENT_TYPE)
    return plan["publish_asset_url"]


def finished_video_preview_key(request_id: str, asset_id: str) -> str:
    req = str(request_id or "").strip()
    safe = "".join(ch for ch in str(asset_id or "file") if ch.isalnum() or ch in "-_")[:24] or "file"
    return f"studio/previews/finished-video/{req}/{safe}.mp4"


def is_public_finished_video_url(url: str) -> bool:
    href = str(url or "").strip()
    if not is_public_publish_url(href):
        return False
    path = href.split("?", 1)[0].lower()
    return path.endswith((".mp4", ".mov", ".m4v", ".webm"))


def existing_finished_preview_url(master: dict[str, Any]) -> str:
    for name in ("preview_public_url", "url", "preview_url"):
        href = str(master.get(name) or "").strip()
        if is_public_finished_video_url(href):
            return href
    key = str(master.get("preview_r2_key") or "").strip().lstrip("/")
    if key.startswith("studio/previews/"):
        return f"{PUBLIC_MEDIA_BASE}/{key}"
    return ""


def download_master_video_bytes(master: dict[str, Any], client) -> bytes:
    from item4.settings import PipelineSettings
    from item4.sources import download_via_media_bridge
    from integrations.google_drive import GoogleDriveClient

    drive_id = str(master.get("google_drive_file_id") or "").strip()
    if drive_id:
        content, _mime = GoogleDriveClient().download_file(drive_id)
        return content
    key = str(master.get("r2_key") or "").strip() or master_r2_key_from_url(str(master.get("url") or ""))
    if not key:
        raise RuntimeError("No Drive file id or studio/master-assets key to stage")
    content, _mime = download_via_media_bridge(key, PipelineSettings(client))
    return content


def stage_finished_video_preview(request_id: str, asset_id: str, content: bytes) -> str:
    from integrations.r2_upload import R2UploadClient

    key = finished_video_preview_key(request_id, asset_id)
    R2UploadClient().put_object(key, content, CONTENT_TYPE)
    return f"{PUBLIC_MEDIA_BASE}/{key}"
