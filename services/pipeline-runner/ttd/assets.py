from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
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


def expected_image_count(record: dict[str, Any], actual: int) -> int | None:
    return parse_int(field(record, "Image_Count"), None) if field(record, "Image_Count") not in (None, "") else actual


def draft_type_for_photos(count: int) -> str:
    return DRAFT_TYPE_SINGLE if count == 1 else DRAFT_TYPE_CAROUSEL


def _profile_names(record: dict[str, Any] | None) -> list[str]:
    raw = field(record or {}, "Content_Profile")
    values: list[str] = []
    if isinstance(raw, list):
        values = [str(item).strip() for item in raw if str(item).strip()]
    elif isinstance(raw, dict):
        nested = raw.get("valuesByLinkedRecordId")
        if isinstance(nested, dict):
            for items in nested.values():
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict):
                            name = str(item.get("name") or "").strip()
                            if name:
                                values.append(name)
                        elif str(item or "").strip():
                            values.append(str(item).strip())
        elif str(raw.get("name") or "").strip():
            values.append(str(raw.get("name")).strip())
    elif str(raw or "").strip():
        values = [str(raw).strip()]
    return list(dict.fromkeys(values))


def pending_share_formula(record_id: str, record: dict[str, Any] | None = None) -> str:
    safe = str(record_id or "").replace("\\", "\\\\").replace('"', '\\"')
    pending = (
        'AND({Platform}="TikTok",{Manual_Completion_Status}="Required",'
        '{TikTok_Draft_Status}="Draft Delivered — Manual Action Required"'
    )
    profiles = _profile_names(record)
    if profiles:
        clauses = []
        for profile in profiles:
            escaped = profile.replace("\\", "\\\\").replace('"', '\\"')
            clauses.append(f'FIND("{escaped}",ARRAYJOIN({{Content_Profile}}))>0')
        profile_filter = clauses[0] if len(clauses) == 1 else f'OR({",".join(clauses)})'
        pending += f',{profile_filter}'
    pending += ")"
    return f'OR({pending},RECORD_ID()="{safe}")'


def pending_manual_share_count(client: AirtableClient, record_id: str, record: dict[str, Any] | None = None) -> int:
    rows = client.list_records(PLATFORM_OUTPUTS_TABLE, formula=pending_share_formula(record_id, record), max_records=20)
    return max(0, len(rows) - 1)


def parse_photo_images(record: dict[str, Any]) -> list[str]:
    parsed = parse_json_field(field(record, "TikTok_Draft_Assets_JSON"))
    if isinstance(parsed, list):
        return [str(item).strip() for item in parsed if str(item).strip()]
    if isinstance(parsed, dict):
        url = str(parsed.get("source_url") or "").strip()
        return [url] if url else []
    return []
