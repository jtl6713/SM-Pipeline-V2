"""Quality Coach contract for TikTok inbox handoff metadata.

Pure validation, deliberately before the atomic email claim. Never fabricate
identifiers, covers, or photo counts from a different output.
"""
from __future__ import annotations

from typing import Any
from render.fields import field, field_str
from ttd.assets import parse_photo_images


def validate_handoff_metadata(output: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    output_id = str(field(output, "Output_ID") or "").strip()
    if not output_id.isdecimal() or int(output_id) <= 0:
        errors.append("missing_numeric_output_id")
    title = field_str(output, "Output_Title")
    if not title or title.casefold() in {"tiktok draft", "untitled", "unknown"}:
        errors.append("missing_output_title")
    if field_str(output, "Platform").casefold() != "tiktok":
        errors.append("wrong_platform")
    draft_type = field_str(output, "TikTok_Draft_Type").casefold()
    if draft_type != "video":
        cover = field_str(output, "Thumbnail_URL")
        if not cover or "platform-output-unknown" in cover.casefold():
            errors.append("missing_output_specific_cover")
        photos = parse_photo_images(output)
        if not photos:
            errors.append("missing_photo_manifest")
        elif len(set(photos)) != len(photos):
            errors.append("duplicate_photo_urls")
        if any("platform-output-unknown" in url.casefold() for url in photos):
            errors.append("unknown_photo_asset_path")
    return errors
