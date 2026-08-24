from __future__ import annotations

from typing import Any

from asset.helpers import as_bool
from item4.settings import PipelineSettings
from render.fields import field, field_str
from yt.constants import DEFAULT_CATEGORY_ID, DEFAULT_PRIVACY, THUMB_NOT_NEEDED, THUMB_PENDING


def setting_is_true(value: str) -> bool:
    return str(value or "").strip().casefold() == "true"


def youtube_defaults(settings: PipelineSettings) -> dict[str, str]:
    return {
        "privacy": settings.get("YOUTUBE_DEFAULT_PRIVACY"),
        "category_id": settings.get("YOUTUBE_DEFAULT_CATEGORY_ID"),
        "made_for_kids": settings.get("YOUTUBE_DEFAULT_MADE_FOR_KIDS"),
        "synthetic": settings.get("YOUTUBE_DEFAULT_CONTAINS_SYNTHETIC_MEDIA"),
    }


def description_final(record: dict[str, Any]) -> str:
    body = field_str(record, "YouTube_Description_Final") or field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    if hashtags:
        return f"{body}\n\n{hashtags}".strip()
    return body


def idempotency_key(record: dict[str, Any]) -> str:
    output_id = field_str(record, "Output_ID") or "unknown"
    record_id = str(record.get("id") or "").strip()
    txn = field_str(record, "Replace_Transaction_ID") or "BASE"
    return f"YT-{output_id}-{record_id}-{txn}"


def thumbnail_status(record: dict[str, Any]) -> str:
    current = field_str(record, "YouTube_Thumbnail_Status")
    if current:
        return current
    return THUMB_PENDING if field_str(record, "Thumbnail_URL") else THUMB_NOT_NEEDED


def package_fields(record: dict[str, Any], defaults: dict[str, str], *, source_url: str, prepared_at: str) -> dict[str, Any]:
    made_for_kids = field(record, "YouTube_Made_For_Kids")
    if made_for_kids is None or made_for_kids == "":
        made_for_kids = setting_is_true(defaults.get("made_for_kids", ""))
    synthetic = field(record, "YouTube_Contains_Synthetic_Media")
    if synthetic is None or synthetic == "":
        synthetic = setting_is_true(defaults.get("synthetic", ""))
    return {
        "YouTube_Category_ID": field_str(record, "YouTube_Category_ID")
        or defaults.get("category_id")
        or DEFAULT_CATEGORY_ID,
        "YouTube_Privacy_Status": field_str(record, "YouTube_Privacy_Status")
        or defaults.get("privacy")
        or DEFAULT_PRIVACY,
        "YouTube_Made_For_Kids": as_bool(made_for_kids, False),
        "YouTube_Contains_Synthetic_Media": as_bool(synthetic, False),
        "YouTube_Description_Final": description_final(record),
        "YouTube_Idempotency_Key": field_str(record, "YouTube_Idempotency_Key") or idempotency_key(record),
        "YouTube_Thumbnail_Status": thumbnail_status(record),
        "YouTube_Content_Class": field_str(record, "YouTube_Content_Class"),
        "YouTube_Response_JSON": (
            f'{{"prepared_by":"YT0","prepared_at":"{prepared_at}","source_url":"{source_url}"}}'
        ),
    }
