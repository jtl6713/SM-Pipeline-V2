"""Pure routing for A2 MIME intake, A2B skip/backfill, and A3 MIME branches."""

from __future__ import annotations

from typing import Any

from asset.constants import (
    A2B_SKIP_BACKFILL_NAMES,
    A2B_SKIP_NAME_FRAGMENTS,
    BRANDING_EXACT,
    BRANDING_KEYWORDS,
    MAX_FILE_BYTES,
    MUSIC_FILENAME_HINTS,
    VOICEOVER_FILENAME_HINTS,
)
from asset.helpers import contains_any, parse_bytes


def is_branding_name(name: str) -> bool:
    text = (name or "").strip()
    if text == BRANDING_EXACT:
        return True
    lower = text.casefold()
    return any(keyword in lower for keyword in BRANDING_KEYWORDS)


def classify_intake_file(name: str, mime: str) -> str:
    """A2 router 8 — first match wins: video, branding, image, other, audio."""
    mime_l = (mime or "").strip().casefold()
    name_l = (name or "").strip().casefold()
    if mime_l.startswith("video"):
        return "video"
    if is_branding_name(name):
        return "branding"
    if mime_l.startswith("image"):
        return "image"
    if mime_l.startswith("audio") or name_l.endswith((".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg")):
        return "audio"
    return "other"


def branding_asset_role(name: str) -> str:
    lower = (name or "").casefold()
    if "watermark" in lower:
        return "Watermark"
    if "logo" in lower:
        return "Logo"
    return "Other"


def a2_route_fields(route: str, name: str, file_id: str) -> dict[str, Any]:
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    if route == "video":
        return {
            "Media_Class": "Video",
            "Asset_Role": "Raw Footage",
            "Raw_Source_Eligibility": "Needs Review",
            "Capture_Source": "Self Filmed",
            "Rights_Status": "Owned",
            "Drive_Access_Status": "Public",
            "Google Drive File ID": file_id,
            "Google Drive URL": url,
        }
    if route == "branding":
        return {
            "Media_Class": "Graphic",
            "Asset_Role": branding_asset_role(name),
            "Raw_Source_Eligibility": "Not Applicable",
            "Capture_Source": "Client Provided",
            "Rights_Status": "Owned",
            "Drive_Access_Status": "Public",
            "Google Drive File ID": file_id,
            "Google Drive URL": url,
        }
    if route == "image":
        return {
            "Media_Class": "Image",
            "Asset_Role": "Raw Photo",
            "Raw_Source_Eligibility": "Needs Review",
            "Capture_Source": "Self Filmed",
            "Rights_Status": "Owned",
            "Google Drive File ID": file_id,
            "Google Drive URL": url,
        }
    if route == "audio":
        return {
            "Media_Class": "Audio",
            "Asset_Role": "Music",
            "Raw_Source_Eligibility": "Not Applicable",
            "Capture_Source": "Stock",
            "Rights_Status": "Licensed",
            "Drive_Access_Status": "Public",
            "Google Drive File ID": file_id,
            "Google Drive URL": url,
        }
    return {
        "Media_Class": "Other",
        "Asset_Role": "Other",
        "Raw_Source_Eligibility": "Needs Review",
        "Capture_Source": "Self Filmed",
        "Rights_Status": "Owned",
        "Google Drive File ID": file_id,
        "Google Drive URL": url,
    }


def a2b_is_platform_output_name(name: str) -> bool:
    return contains_any(name or "", A2B_SKIP_NAME_FRAGMENTS)


def a2b_is_excluded_backfill_name(name: str) -> bool:
    text = name or ""
    if a2b_is_platform_output_name(text):
        return True
    return any(fragment in text for fragment in A2B_SKIP_BACKFILL_NAMES if fragment not in A2B_SKIP_NAME_FRAGMENTS)


def a2b_capture_source(name: str) -> str:
    lower = (name or "").casefold()
    if "dji" in lower or "drone" in lower:
        return "Drone"
    return "Self Filmed"


def a2b_route(file: dict[str, Any], existing_ids: set[str]) -> str:
    """Return oversize | backfill | skip_existing | ignore."""
    mime = str(file.get("mimeType") or "").strip().casefold()
    if not mime.startswith("video"):
        return "ignore"
    size = parse_bytes(file.get("size"))
    name = str(file.get("name") or "")
    file_id = str(file.get("id") or "")
    if size > MAX_FILE_BYTES and not a2b_is_platform_output_name(name):
        return "oversize"
    if size >= MAX_FILE_BYTES:
        return "ignore"
    if file_id in existing_ids:
        return "skip_existing"
    if a2b_is_excluded_backfill_name(name):
        return "ignore"
    return "backfill"


def a3_mime_route(mime: str) -> str:
    lower = (mime or "").strip().casefold()
    if lower.startswith("audio"):
        return "audio"
    if lower.startswith("video"):
        return "video"
    if lower.startswith("image"):
        return "image"
    return "unsupported"


def audio_role_fallback(ai_role: str, filename: str) -> str:
    role = (ai_role or "").strip()
    if role:
        return role
    lower = (filename or "").casefold()
    if any(hint in lower for hint in VOICEOVER_FILENAME_HINTS):
        return "Voiceover"
    if any(hint in lower for hint in MUSIC_FILENAME_HINTS):
        return "Music"
    return "Other"


def a4_is_missing(*, trash_ids: set[str], drive_file_id: str, head_status: int | None) -> bool:
    if drive_file_id and drive_file_id in trash_ids:
        return True
    if head_status is not None and head_status > 399:
        return True
    return False


def a4_is_healthy(*, trash_ids: set[str], drive_file_id: str, head_status: int | None) -> bool:
    if not drive_file_id:
        return False
    if drive_file_id in trash_ids:
        return False
    if head_status is None or head_status >= 400:
        return False
    return True
