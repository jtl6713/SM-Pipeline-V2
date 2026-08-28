from __future__ import annotations

from typing import Any

from ap0.constants import (
    ELIGIBLE_VIDEO_TYPES,
    OUTPUT_STATUS,
    PUBLIC_MEDIA_BASE,
    PUBLISH_METHOD,
    PUBLISH_STATUS,
    REVIEW_STATUS,
    R2_KEY_PREFIX,
)
from ap0.public_cover import cover_needs_public_stage
from ap0.public_mp4 import is_public_publish_url, master_r2_key_from_record
from asset.helpers import as_bool
from render.fields import field, field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def output_id_token(record: dict[str, Any]) -> str:
    return str(field(record, "Output_ID") or "").strip()


def final_file_id(record: dict[str, Any]) -> str:
    return field_str(record, "Final_File_ID")


def source_token(record: dict[str, Any]) -> str:
    return final_file_id(record) or "finished"


def expected_file_name(record: dict[str, Any]) -> str:
    return f"platform-output-{output_id_token(record)}-{source_token(record)}.mp4"


def r2_object_key(record: dict[str, Any]) -> str:
    return f"{R2_KEY_PREFIX}/platform-output-{output_id_token(record)}/{source_token(record)}.mp4"


def public_asset_url(record: dict[str, Any]) -> str:
    return f"{PUBLIC_MEDIA_BASE}/{r2_object_key(record)}"


def asset_plan(record: dict[str, Any]) -> dict[str, str]:
    return {
        "r2_object_key": r2_object_key(record),
        "publish_asset_url": public_asset_url(record),
        "publish_asset_file_name": expected_file_name(record),
    }


def _type_pair(record: dict[str, Any]) -> tuple[str, str]:
    return (_ci(field_str(record, "Platform")), _ci(field_str(record, "Platform_Output_Type")))


def eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make AP0 would continue past the eligibility filter."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _type_pair(record) not in ELIGIBLE_VIDEO_TYPES:
        return "not_eligible_video_type"
    if _ci(field_str(record, "Review_Status")) != _ci(REVIEW_STATUS):
        return "review_not_approved"
    if _ci(field_str(record, "Output_Status")) != _ci(OUTPUT_STATUS):
        return "output_not_approved_for_publishing"
    if _ci(field_str(record, "Publish_Method")) != _ci(PUBLISH_METHOD):
        return "publish_method_not_automated"
    if not as_bool(field(record, "Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Published_At"):
        return "already_published"
    publish_status = _ci(field_str(record, "Publish_Status"))
    if publish_status not in {_ci(PUBLISH_STATUS), "ready to schedule"}:
        return "publish_status_not_ready"
    if not final_file_id(record) and not master_r2_key_from_record(record):
        return "missing_final_file_id"
    public_url = field_str(record, "Publish_Asset_URL")
    filename_matches = field_str(record, "Publish_Asset_File_Name") == expected_file_name(record)
    if is_public_publish_url(public_url) and filename_matches:
        if cover_needs_public_stage(record):
            return None
        return "already_prepared"
    return None


def is_eligible(record: dict[str, Any]) -> bool:
    return eligibility_reason(record) is None
