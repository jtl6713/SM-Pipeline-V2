from __future__ import annotations

from typing import Any

from asset.helpers import as_bool, parse_int
from fb.constants import (
    STATUS_PENDING_FINALIZE,
    STATUS_PHOTO_READY,
    STATUS_READY_FOR_ASSETS,
    STATUS_READY_FOR_PHOTO,
    STATUS_RECONCILE,
    STATUS_RETRY,
)
from render.fields import field, field_str


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


def error_stage_contains(record: dict[str, Any], prefix: str) -> bool:
    return _ci(prefix) in _ci(field_str(record, "Publish_Error_Stage"))


def is_retry_for(record: dict[str, Any], prefix: str) -> bool:
    return _ci(field_str(record, "FB_Publish_Status")) == _ci(STATUS_RETRY) and error_stage_contains(record, prefix)


def fb0_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "facebook":
        return "not_facebook"
    if not as_bool(field(record, "Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if _ci(field_str(record, "Publish_Status")) == "published":
        return "already_published"
    status = _ci(field_str(record, "FB_Publish_Status")) or _ci(STATUS_READY_FOR_ASSETS)
    if status == _ci(STATUS_READY_FOR_ASSETS) and as_bool(field(record, "Image_Output_Selected"), False):
        return None
    if is_retry_for(record, "FB0"):
        return None
    return "facebook_not_ready_for_assets"


def fb1_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "facebook":
        return "not_facebook"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    status = _ci(field_str(record, "FB_Publish_Status"))
    if status == _ci(STATUS_READY_FOR_PHOTO) or is_retry_for(record, "FB1"):
        return None
    return "facebook_not_ready_for_photo_media"


def fb2_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    status = _ci(field_str(record, "FB_Publish_Status"))
    photo_count = parse_int(field(record, "FB_Photo_Count"), 0) or 0
    image_count = parse_int(field(record, "Image_Count"), 0) or 0
    if status == _ci(STATUS_PHOTO_READY) and photo_count == image_count and photo_count >= 1:
        return None
    if is_retry_for(record, "FB2_PUBLISH"):
        return None
    return "facebook_photo_media_not_ready"


def fb2r_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    if _ci(field_str(record, "FB_Publish_Status")) == _ci(STATUS_RECONCILE):
        return None
    return "facebook_not_reconcile_pending"


def fb3_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if not field_str(record, "Platform_Post_ID"):
        return "missing_platform_post_id"
    if _ci(field_str(record, "Publish_Status")) == "published":
        return "already_published"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    status = _ci(field_str(record, "FB_Publish_Status"))
    if status == _ci(STATUS_PENDING_FINALIZE) or status == _ci(STATUS_RETRY) or status:
        return None
    return None
