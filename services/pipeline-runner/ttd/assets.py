from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from asset.helpers import as_bool, parse_int
from render.fields import field, field_str, json_text, parse_json_field
from ttd.constants import (
    ASSET_ASPECT_FAMILY,
    DEFAULT_MAX_PHOTOS,
    DEFAULT_MEDIA_PREFIX,
    DRAFT_TYPE_CAROUSEL,
    DRAFT_TYPE_SINGLE,
    DRAFT_TYPE_VIDEO,
    IMAGE_PUBLISH_MODE,
    SLIDES_TABLE_VIEW,
)


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def is_photo_route(record: dict[str, Any]) -> bool:
    # Studio's TikTok handoff owns both fields now, but accept the stable draft type
    # as a fallback so an older row cannot be stranded by a blank Image_Output_Type.
    image_type = field_str(record, "Image_Output_Type") or field_str(record, "TikTok_Draft_Type")
    return (
        as_bool(field(record, "Image_Output_Selected"), False)
        and _ci(field_str(record, "Image_Publish_Mode")) == _ci(IMAGE_PUBLISH_MODE)
        and _ci(field_str(record, "Asset_Aspect_Family")) == _ci(ASSET_ASPECT_FAMILY)
        and _ci(image_type) in {_ci(DRAFT_TYPE_SINGLE), _ci(DRAFT_TYPE_CAROUSEL)}
    )


def video_source_url(record: dict[str, Any]) -> str:
    return field_str(record, "Publish_Asset_URL") or field_str(record, "Final_File_URL")


def is_video_route(record: dict[str, Any]) -> bool:
    return _ci(field_str(record, "TikTok_Draft_Type")) == _ci(DRAFT_TYPE_VIDEO) and video_source_url(record).startswith(
        DEFAULT_MEDIA_PREFIX
    )


def slide_formula(output_id: str) -> str:
    safe = str(output_id or "").replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'AND(FIND("{safe}",ARRAYJOIN({{PO_Output_ID}}))>0,'
        '{Asset_9x16_Public_Status}="Ready",{Asset_9x16_Public_URL}!=BLANK())'
    )


def _sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return (
        parse_int(field(record, "Current Order"), 10**9) or 10**9,
        parse_int(field(record, "Slide Number"), 10**9) or 10**9,
    )


def list_ready_slides(client: AirtableClient, output_id: str, *, max_photos: int = DEFAULT_MAX_PHOTOS) -> list[dict[str, Any]]:
    formula = slide_formula(output_id)
    try:
        rows = client.list_records(
            CAROUSEL_SLIDES_TABLE,
            formula=formula,
            view=SLIDES_TABLE_VIEW,
            max_records=max_photos,
        )
    except Exception:
        rows = client.list_records(
            CAROUSEL_SLIDES_TABLE,
            formula=formula,
            max_records=max_photos,
        )
    return sorted(rows, key=_sort_key)


def photo_urls(slides: list[dict[str, Any]]) -> list[str]:
    urls: list[str] = []
    for slide in slides:
        url = field_str(slide, "Asset_9x16_Public_URL")
        if url:
            urls.append(url)
    return urls


def photo_manifest(urls: list[str]) -> str:
    return json_text(urls)


def video_manifest(source_url: str) -> str:
    return json_text({"source_url": source_url})


def render_clip_photo_urls(record: dict[str, Any]) -> list[str]:
    """Authoritative ordered photo URLs already stamped onto the Platform Output."""
    parsed = parse_json_field(field(record, "Render_Clip_List_JSON"))
    if not isinstance(parsed, list):
        return []
    urls: list[str] = []
    for clip in parsed:
        if not isinstance(clip, dict):
            continue
        url = str(clip.get("url") or clip.get("src") or "").strip()
        if url:
            urls.append(url)
    return urls


def expected_image_count(record: dict[str, Any], actual: int) -> int | None:
    return parse_int(field(record, "Image_Count"), None) if field(record, "Image_Count") not in (None, "") else actual


def draft_type_for_photos(count: int) -> str:
    return DRAFT_TYPE_SINGLE if count == 1 else DRAFT_TYPE_CAROUSEL


def parse_photo_images(record: dict[str, Any]) -> list[str]:
    parsed = parse_json_field(field(record, "TikTok_Draft_Assets_JSON"))
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    if isinstance(parsed, dict):
        url = str(parsed.get("source_url") or "").strip()
        return [url] if url else []
    return []
