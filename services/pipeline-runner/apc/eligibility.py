from __future__ import annotations

from typing import Any

from apc.common import ci, is_due, schedule_hold
from apc.constants import (
    ERROR_AP4C,
    STATUS_ASSETS_READY,
    STATUS_CHILDREN_PROCESSING,
    STATUS_CHILDREN_READY,
    STATUS_PARENT_PROCESSING,
    STATUS_PARENT_READY,
    STATUS_PUBLISHING,
    STATUS_READY_FOR_ASSET_PREP,
    STATUS_RETRY,
)
from asset.helpers import as_bool
from render.fields import field, field_str


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


def _carousel_base(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "Platform")) != "instagram":
        return "not_instagram"
    if ci(field_str(record, "Platform_Output_Type")) != "instagram carousel":
        return "not_instagram_carousel"
    if "approved" not in ci(field_str(record, "Output_Status")):
        return "output_not_approved"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    return None


def ap0c_eligibility_reason(record: dict[str, Any]) -> str | None:
    base = _carousel_base(record)
    if base:
        return base
    if ci(field_str(record, "Publish_Status")) != "ready to publish":
        return "publish_status_not_ready"
    if ci(field_str(record, "Publish_Method")) != "automated":
        return "not_automated"
    if not as_bool(field(record, "Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(field(record, "Manual_Fallback_Required"), False):
        return "manual_fallback_required"
    if field_str(record, "Platform_Post_ID") or field_str(record, "Published_At"):
        return "already_published"
    status = ci(field_str(record, "IG_Carousel_Status"))
    if status == ci(STATUS_READY_FOR_ASSET_PREP):
        return None
    if status == ci(STATUS_RETRY) and as_bool(field(record, "Publish_Retry_Eligible"), False):
        return None
    return "carousel_not_ready_for_assets"


def ap1c_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_ASSETS_READY):
        return "carousel_assets_not_ready"
    if ci(field_str(record, "Publish_Method")) != "automated":
        return "not_automated"
    if not as_bool(field(record, "Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    return None


def ap2c_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_CHILDREN_PROCESSING):
        return "carousel_children_not_processing"
    if not is_due(record):
        return "not_due"
    return None


def ap3c_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_CHILDREN_READY):
        return "carousel_children_not_ready"
    if str(field(record, "IG_Carousel_All_Children_Ready") or "").strip() in {"0", "false", "False"}:
        return "carousel_children_not_all_ready"
    if field_str(record, "IG_Carousel_Parent_Container_ID"):
        return "parent_already_created"
    if field_str(record, "Publish_Locked_At"):
        return "output_locked"
    return None


def ap3p_eligibility_reason(record: dict[str, Any]) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_PARENT_PROCESSING):
        return "carousel_parent_not_processing"
    if not field_str(record, "IG_Carousel_Parent_Container_ID"):
        return "missing_parent_container"
    if not is_due(record):
        return "not_due"
    return None


def ap4c_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_PARENT_READY):
        return "carousel_parent_not_ready"
    if not field_str(record, "IG_Carousel_Parent_Container_ID"):
        return "missing_parent_container"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if as_bool(field(record, "Do_Not_Publish"), False):
        return "do_not_publish"
    # Parent containers are warmed before schedule; media_publish must wait.
    if schedule_hold(record):
        return "schedule_hold"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def ap4r_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_PUBLISHING):
        return "carousel_not_publishing"
    if field_str(record, "IG_Carousel_Published_Media_ID"):
        return "already_has_published_media"
    if ci(field_str(record, "IG_Carousel_Error_Stage")) != ci(ERROR_AP4C):
        return "not_ambiguous_publish"
    if not is_due(record):
        return "not_due"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def ap5c_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if ci(field_str(record, "IG_Carousel_Status")) != ci(STATUS_PUBLISHING):
        return "carousel_not_publishing"
    if not field_str(record, "IG_Carousel_Published_Media_ID"):
        return "missing_published_media"
    if field_str(record, "Platform_Post_URL"):
        return "already_finalized"
    if not is_due(record):
        return "not_due"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None
