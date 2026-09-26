from __future__ import annotations

from typing import Any

from ap1_ig.constants import (
    OUTPUT_STATUS,
    PLATFORM,
    PLATFORM_OUTPUT_TYPE,
    PUBLISH_METHOD,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_READY,
    REVIEW_STATUS,
)
from asset.helpers import as_bool
from render.fields import field, field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    """Return a skip reason, or None when Make AP1-IG would pass the eligibility filter."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != _ci(PLATFORM):
        return "not_instagram"
    if _ci(field_str(record, "Platform_Output_Type")) != _ci(PLATFORM_OUTPUT_TYPE):
        return "not_instagram_reel"
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
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    publish_status = _ci(field_str(record, "Publish_Status"))
    existing_container = field_str(record, "Platform_Media_ID")
    resuming = bool(existing_container) and publish_status in {
        _ci(PUBLISH_STATUS_READY),
        _ci(PUBLISH_STATUS_PUBLISHING),
    }
    if publish_status != _ci(PUBLISH_STATUS_READY) and not resuming:
        return "publish_status_not_ready"
    if not field_str(record, "Publish_Asset_URL"):
        return "missing_publish_asset_url"
    requested_txn = str(replace_transaction_id or "").strip()
    record_txn = field_str(record, "Replace_Transaction_ID")
    if requested_txn != record_txn:
        return "replace_transaction_mismatch"
    requested_fp = str(replace_fingerprint or "").strip()
    record_fp = field_str(record, "Replace_Fingerprint")
    if requested_fp != record_fp:
        return "replace_fingerprint_mismatch"
    return None


def is_eligible(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> bool:
    return eligibility_reason(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ) is None
