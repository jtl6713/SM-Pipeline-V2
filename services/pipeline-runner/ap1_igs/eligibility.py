from __future__ import annotations

from typing import Any

from ap1_igs.asset import story_asset_url
from ap1_igs.constants import (
    OUTPUT_STATUS,
    PLATFORM,
    PLATFORM_OUTPUT_TYPE,
    PLATFORM_OUTPUT_TYPE_REEL,
    PUBLISH_METHOD,
    PUBLISH_STATUS_READY,
    REVIEW_STATUS,
    STORY_STATUS_PUBLISHING,
    STORY_STATUS_READY,
)
from asset.helpers import as_bool
from render.fields import field, field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def _replace_mismatch(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None,
    replace_fingerprint: str | None,
) -> str | None:
    requested_txn = str(replace_transaction_id or "").strip()
    if requested_txn != field_str(record, "Replace_Transaction_ID"):
        return "replace_transaction_mismatch"
    requested_fp = str(replace_fingerprint or "").strip()
    if requested_fp != field_str(record, "Replace_Fingerprint"):
        return "replace_fingerprint_mismatch"
    return None


def _first_class_story_ready(record: dict[str, Any]) -> bool:
    status = field_str(record, "IG_Story_Status")
    return (
        _ci(field_str(record, "Platform")) == _ci(PLATFORM)
        and _ci(field_str(record, "Review_Status")) == _ci(REVIEW_STATUS)
        and _ci(field_str(record, "Output_Status")) == _ci(OUTPUT_STATUS)
        and _ci(field_str(record, "Publish_Method")) == _ci(PUBLISH_METHOD)
        and as_bool(field(record, "Auto_Publish_Enabled"), False)
        and not as_bool(field(record, "Do_Not_Publish"), False)
        and not field_str(record, "Published_At")
        and bool(story_asset_url(record))
        and not field_str(record, "IG_Story_Container_ID")
        and not field_str(record, "IG_Story_Post_ID")
        and _ci(field_str(record, "Platform_Output_Type")) == _ci(PLATFORM_OUTPUT_TYPE)
        and _ci(field_str(record, "Publish_Status")) == _ci(PUBLISH_STATUS_READY)
        and not field_str(record, "Platform_Post_ID")
        and (not status or _ci(status) == _ci(STORY_STATUS_READY))
    )


def _legacy_reel_story_ready(record: dict[str, Any]) -> bool:
    return (
        _ci(field_str(record, "Platform")) == _ci(PLATFORM)
        and _ci(field_str(record, "Platform_Output_Type")) == _ci(PLATFORM_OUTPUT_TYPE_REEL)
        and as_bool(field(record, "IG_Story_Enabled"), False)
        and _ci(field_str(record, "IG_Story_Status")) == _ci(STORY_STATUS_READY)
        and not field_str(record, "IG_Story_Post_ID")
        and not field_str(record, "IG_Story_Container_ID")
        and bool(story_asset_url(record))
        and not as_bool(field(record, "Do_Not_Publish"), False)
        and _ci(field_str(record, "Review_Status")) == _ci(REVIEW_STATUS)
    )


def create_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    """Return a skip reason, or None when Make AP1-IGS would pass the lock filter."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    mismatch = _replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    if mismatch:
        return mismatch
    if _first_class_story_ready(record) or _legacy_reel_story_ready(record):
        return None
    if _ci(field_str(record, "Platform")) != _ci(PLATFORM):
        return "not_instagram"
    if field_str(record, "IG_Story_Container_ID"):
        return "already_has_story_container"
    if field_str(record, "IG_Story_Post_ID"):
        return "already_has_story_post"
    if _ci(field_str(record, "Platform_Output_Type")) == _ci(PLATFORM_OUTPUT_TYPE_REEL):
        return "legacy_reel_story_not_ready"
    if _ci(field_str(record, "Platform_Output_Type")) != _ci(PLATFORM_OUTPUT_TYPE):
        return "not_instagram_story"
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
    if not story_asset_url(record):
        return "missing_publish_asset_url"
    if _ci(field_str(record, "Publish_Status")) != _ci(PUBLISH_STATUS_READY):
        return "publish_status_not_ready"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    status = field_str(record, "IG_Story_Status")
    if status and _ci(status) != _ci(STORY_STATUS_READY):
        return "story_status_not_ready"
    return "not_eligible"


def poll_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    """Return a skip reason, or None when Make AP1-IGS-POLL would poll the container."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != _ci(PLATFORM):
        return "not_instagram"
    if _ci(field_str(record, "Review_Status")) != _ci(REVIEW_STATUS):
        return "review_not_approved"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if _ci(field_str(record, "IG_Story_Status")) != _ci(STORY_STATUS_PUBLISHING):
        return "story_status_not_publishing"
    if not field_str(record, "IG_Story_Container_ID"):
        return "missing_story_container"
    if field_str(record, "IG_Story_Post_ID"):
        return "already_has_story_post"
    return _replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
