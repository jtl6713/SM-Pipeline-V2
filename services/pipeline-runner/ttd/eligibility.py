from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from asset.helpers import as_bool
from render.fields import field_str
from ttd.constants import (
    IMAGE_PUBLISH_MODE,
    MANUAL_REQUIRED,
    STAGE_CAPACITY,
    STAGE_TTD0,
    STAGE_TTD1,
    STAGE_TTD2,
    STAGE_TTD3,
    STATUS_DELIVERED,
    STATUS_MANUAL_RECEIVED,
    STATUS_PROCESSING,
    STATUS_READY_FOR_ASSETS,
    STATUS_READY_FOR_DELIVERY,
    STATUS_RETRY,
    STATUS_WAITING_FOR_SCHEDULE,
    TIKTOK_INBOX_LEAD_MINUTES,
)


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def replace_mismatch(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> bool:
    return (
        str(replace_transaction_id or "").strip() != field_str(record, "Replace_Transaction_ID")
        or str(replace_fingerprint or "").strip() != field_str(record, "Replace_Fingerprint")
    )


def error_stage_starts(record: dict[str, Any], prefix: str) -> bool:
    return _ci(field_str(record, "Publish_Error_Stage")).startswith(_ci(prefix))


def is_retry_for(record: dict[str, Any], prefix: str) -> bool:
    return _ci(field_str(record, "TikTok_Draft_Status")) == _ci(STATUS_RETRY) and error_stage_starts(record, prefix)


def _scheduled_ms(record: dict[str, Any]) -> int | None:
    raw = field_str(record, "Scheduled_Post_Date")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except (TypeError, ValueError):
        return None


def tiktok_inbox_is_due(
    record: dict[str, Any],
    *,
    now_ms: int | None = None,
    lead_minutes: int = TIKTOK_INBOX_LEAD_MINUTES,
) -> bool:
    scheduled_ms = _scheduled_ms(record)
    if scheduled_ms is None:
        return True
    now = now_ms if now_ms is not None else int(datetime.now(timezone.utc).timestamp() * 1000)
    return scheduled_ms <= now + (lead_minutes * 60 * 1000)


def ttd0_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "tiktok":
        return "not_tiktok"
    if not as_bool(record.get("fields", {}).get("Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "TikTok_Draft_Publish_ID"):
        return "already_has_draft_publish_id"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    status = _ci(field_str(record, "TikTok_Draft_Status"))
    if status == _ci(STATUS_WAITING_FOR_SCHEDULE):
        return "tiktok_draft_waiting_for_schedule"
    if status == _ci(STATUS_READY_FOR_ASSETS) or is_retry_for(record, STAGE_TTD0):
        if not tiktok_inbox_is_due(record):
            return "tiktok_draft_before_inbox_lead_window"
        return None
    return "tiktok_draft_not_ready_for_assets"


def ttd1_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "tiktok":
        return "not_tiktok"
    if field_str(record, "TikTok_Draft_Publish_ID"):
        return "already_has_draft_publish_id"
    if not as_bool(record.get("fields", {}).get("Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    status = _ci(field_str(record, "TikTok_Draft_Status"))
    if status == _ci(STATUS_READY_FOR_DELIVERY):
        return None
    if is_retry_for(record, STAGE_TTD1) or is_retry_for(record, STAGE_CAPACITY):
        return None
    return "tiktok_draft_not_ready_for_delivery"


def ttd2_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "tiktok":
        return "not_tiktok"
    if not field_str(record, "TikTok_Draft_Publish_ID"):
        return "missing_draft_publish_id"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    status = _ci(field_str(record, "TikTok_Draft_Status"))
    if status == _ci(STATUS_PROCESSING) or is_retry_for(record, STAGE_TTD2):
        return None
    return "tiktok_draft_not_processing"


def ttd3_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "tiktok":
        return "not_tiktok"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if not field_str(record, "TikTok_Draft_Delivered_At"):
        return "missing_delivered_at"
    if field_str(record, "TikTok_Draft_Email_Sent_At"):
        return "email_already_sent"
    if not field_str(record, "TikTok_Manual_Completion_URL"):
        return "missing_completion_url"
    if _ci(field_str(record, "Manual_Completion_Status")) != _ci(MANUAL_REQUIRED):
        return "manual_completion_not_required"
    status = _ci(field_str(record, "TikTok_Draft_Status"))
    if status in {_ci(STATUS_DELIVERED), _ci(STATUS_MANUAL_RECEIVED)} or is_retry_for(record, STAGE_TTD3):
        return None
    return "tiktok_draft_not_ready_for_email"


def ttd4_form_eligibility_reason(record: dict[str, Any], *, token: str) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if str(token or "").strip() != field_str(record, "TikTok_Manual_Completion_Token"):
        return "token_mismatch"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if _ci(field_str(record, "Publish_Status")) == "published":
        return "already_published"
    if _ci(field_str(record, "Manual_Completion_Status")) != _ci(MANUAL_REQUIRED):
        return "manual_completion_not_required"
    return None
