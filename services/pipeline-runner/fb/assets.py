from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from asset.helpers import parse_int
from fb.constants import (
    DEFAULT_MAX_PHOTOS,
    DEFAULT_UNPUBLISHED_RECREATE_HOURS,
    MODE_SINGLE,
    MODE_SLIDESHOW,
    PHOTO_STATUS_READY,
)
from render.fields import field, field_str, json_text


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def resolved_publish_mode(record: dict[str, Any]) -> str:
    explicit = field_str(record, "FB_Resolved_Publish_Mode")
    if explicit:
        return explicit
    count = parse_int(field(record, "Image_Count"), 0) or 0
    return MODE_SLIDESHOW if count > 1 else MODE_SINGLE


def is_slideshow_route(record: dict[str, Any]) -> bool:
    return _ci(resolved_publish_mode(record)) == _ci(MODE_SLIDESHOW)


def slide_formula(output_id: str) -> str:
    safe = str(output_id or "").replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'AND(FIND("{safe}",ARRAYJOIN({{PO_Output_ID}}))>0,'
        '{Shared_Asset_Approved}=1,{Asset_4x5_Public_Status}="Ready",{Asset_4x5_Public_URL}!=BLANK())'
    )


def ready_photo_formula(output_id: str, package_revision: str) -> str:
    safe = str(output_id or "").replace("\\", "\\\\").replace('"', '\\"')
    revision = str(package_revision or "").replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'AND(FIND("{safe}",ARRAYJOIN({{PO_Output_ID}}))>0,'
        f'{{FB_Photo_Status}}="Ready",{{FB_Photo_ID}}!=BLANK(),{{FB_Photo_Package_Revision}}="{revision}")'
    )


def _sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return (
        parse_int(field(record, "Current Order"), 10**9) or 10**9,
        parse_int(field(record, "Slide Number"), 10**9) or 10**9,
    )


def list_ready_slides(
    client: AirtableClient,
    output_id: str,
    *,
    max_photos: int = DEFAULT_MAX_PHOTOS,
) -> list[dict[str, Any]]:
    formula = slide_formula(output_id)
    rows = client.list_records(CAROUSEL_SLIDES_TABLE, formula=formula, max_records=max_photos)
    return sorted(rows, key=_sort_key)


def list_ready_photos(client: AirtableClient, output_id: str, package_revision: str) -> list[dict[str, Any]]:
    formula = ready_photo_formula(output_id, package_revision)
    rows = client.list_records(CAROUSEL_SLIDES_TABLE, formula=formula, max_records=25)
    return sorted(rows, key=_sort_key)


def revision_fragment(slide: dict[str, Any]) -> str:
    return field_str(slide, "Shared_Asset_Revision") or field_str(slide, "Asset_4x5_Public_URL")


def package_revision(slides: list[dict[str, Any]]) -> str:
    joined = "|".join(revision_fragment(slide) for slide in slides)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def photo_urls(slides: list[dict[str, Any]]) -> list[str]:
    return [url for url in (field_str(slide, "Asset_4x5_Public_URL") for slide in slides) if url]


def photo_ids(slides: list[dict[str, Any]]) -> list[str]:
    return [photo_id for photo_id in (field_str(slide, "FB_Photo_ID") for slide in slides) if photo_id]


def quoted_url_array(urls: list[str]) -> str:
    return json_text(urls)


def facebook_message(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    if caption and hashtags:
        return f"{caption}\n\n{hashtags}"
    return caption or hashtags


def post_fingerprint(message: str, ids: list[str]) -> str:
    return hashlib.sha256(f"{message}|{','.join(ids)}".encode("utf-8")).hexdigest()


def _parse_utc(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def photo_needs_create(
    slide: dict[str, Any],
    *,
    package_rev: str,
    recreate_hours: int = DEFAULT_UNPUBLISHED_RECREATE_HOURS,
    now: datetime | None = None,
) -> bool:
    if not field_str(slide, "FB_Photo_ID"):
        return True
    if _ci(field_str(slide, "FB_Photo_Status")) != _ci(PHOTO_STATUS_READY):
        return True
    if field_str(slide, "FB_Photo_Package_Revision") != package_rev:
        return True
    created = _parse_utc(field_str(slide, "FB_Photo_Created_At"))
    if created is None:
        return False
    age = (now or datetime.now(timezone.utc)) - created
    return age.total_seconds() >= max(recreate_hours, 0) * 3600
