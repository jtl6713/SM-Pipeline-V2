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
    STATUS_NEEDS_ASSET_REPAIR,
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


def _retry_not_due(record: dict[str, Any]) -> bool:
    raw = field_str(record, "Publish_Next_Retry_At")
    if not raw:
        return False
    try:
        retry = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if retry.tzinfo is None:
            retry = retry.replace(tzinfo=timezone.utc)
        return retry > datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


def _retry_attempt_ceiling_reached(record: dict[str, Any], *, limit: int = 5) -> bool:
    """Fence a repeatedly failed stage until a verified repair explicitly rearms it.

    The current attempt counter spans stages, so this is deliberately
    conservative and only applies while the record is Retry Pending.
    An invalid nonblank counter must not allow unlimited provider retries.
    """
    raw = field_str(record, "Publish_Attempt_Count").strip()
    if not raw:
        return False
    try:
        return int(raw) >= limit
    except ValueError:
        return True


def _inbox_lead_hold(record: dict[str, Any]) -> str | None:
    if tiktok_inbox_is_due(record):
        return None
    return "tiktok_draft_before_inbox_lead_window"


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
    if status == _ci(STATUS_NEEDS_ASSET_REPAIR):
        return "tiktok_asset_repair_required"
    if status == _ci(STATUS_WAITING_FOR_SCHEDULE):
        return "tiktok_draft_waiting_for_schedule"
    if status == _ci(STATUS_READY_FOR_ASSETS):
        if not tiktok_inbox_is_due(record):
            return "tiktok_draft_before_inbox_lead_window"
        return None
    if is_retry_for(record, STAGE_TTD0):
        # The stage has already proved its approved 9:16 image set incomplete.
        # No further TTD0 invocation can prepare missing images; only a
        # verified upstream asset repair may explicitly rearm Ready for Assets.
        if (
            error_stage_starts(record, "TTD0_ASSETS")
            and record.get("fields", {}).get("Publish_Retry_Eligible") is False
        ):
            return "tiktok_asset_repair_required"
        if _retry_attempt_ceiling_reached(record):
            return "tiktok_draft_retry_limit_reached"
        if _retry_not_due(record):
            return "tiktok_retry_backoff"
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
    if status in {_ci(STATUS_READY_FOR_DELIVERY), _ci(STATUS_WAITING_FOR_SCHEDULE)}:
        return _inbox_lead_hold(record) or ("tiktok_retry_backoff" if _retry_not_due(record) else None)
    if is_retry_for(record, STAGE_TTD1) or is_retry_for(record, STAGE_CAPACITY):
        if _retry_attempt_ceiling_reached(record):
            return "tiktok_draft_retry_limit_reached"
        return _inbox_lead_hold(record) or ("tiktok_retry_backoff" if _retry_not_due(record) else None)
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
        return _inbox_lead_hold(record) or ("tiktok_retry_backoff" if _retry_not_due(record) else None)
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


def ttd4_form_eligibility_reason(
    record: dict[str, Any], *, token: str, signing_secret: str = ""
) -> str | None:
    record_id = str(record.get("id") or "").strip()
    if not record_id:
        return "missing_record_id"
    offered = str(token or "").strip()
    # NEVER accept a missing credential, even when the stored field is empty.
    if not offered:
        return "token_mismatch"
    stored = field_str(record, "TikTok_Manual_Completion_Token")
    publish_id = field_str(record, "TikTok_Draft_Publish_ID")
    from ttd.package import completion_token_material, hash_completion_token, stable_completion_token
    import hmac

    valid_stored = bool(stored and hmac.compare_digest(offered, stored))
    legacy_stable = (
        hash_completion_token(completion_token_material(record_id, publish_id))
        if publish_id else ""
    )
    valid_legacy = bool(legacy_stable and hmac.compare_digest(offered, legacy_stable))
    valid_signed = False
    if publish_id and signing_secret:
        signed = stable_completion_token(record_id, publish_id, secret=signing_secret)
        valid_signed = hmac.compare_digest(offered, signed)
    if not (valid_stored or valid_legacy or valid_signed):
        return "token_mismatch"
    if _ci(field_str(record, "Publish_Status")) == "published":
        return "already_published"
    # Do_Not_Publish prohibits initiating or re-sending platform content.
    # It must not stop an owner from recording a post already made manually.
    if _ci(field_str(record, "Manual_Completion_Status")) != _ci(MANUAL_REQUIRED):
        return "do_not_publish" if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False) else "manual_completion_not_required"
    return None
