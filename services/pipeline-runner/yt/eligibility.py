from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from ap0.public_cover import native_grid_cover_required
from ap0.public_mp4 import is_public_publish_url
from asset.helpers import as_bool
from render.fields import field_str
from yt.constants import STAGE_YT1, STAGE_YT2, STAGE_YT4
from yt.package import youtube_publish_at

YOUTUBE_HANDOFF_LEAD_HOURS = 6


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


def package_source_url(record: dict[str, Any]) -> str:
    return field_str(record, "Final_File_URL") or field_str(record, "Publish_Asset_URL")


def upload_source_url(record: dict[str, Any]) -> str:
    return (
        field_str(record, "Publish_Asset_URL")
        or field_str(record, "Studio_Preview_URL")
        or field_str(record, "Final_File_URL")
    )


def yt0_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "youtube":
        return "not_youtube"
    if not as_bool(record.get("fields", {}).get("Auto_Publish_Enabled"), False):
        return "auto_publish_disabled"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if field_str(record, "YouTube_Video_ID"):
        return "already_has_youtube_video"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def youtube_handoff_due(record: dict[str, Any], *, now: datetime | None = None) -> bool:
    """Keep scheduled videos in Studio until the YouTube handoff window opens."""
    publish_at = youtube_publish_at(record)
    if not publish_at:
        return True
    try:
        scheduled = datetime.fromisoformat(publish_at.replace("Z", "+00:00"))
    except ValueError:
        # Preserve existing behavior for malformed dates so YouTube/API validation can surface it.
        return True
    if scheduled.tzinfo is None:
        scheduled = scheduled.replace(tzinfo=timezone.utc)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current >= scheduled - timedelta(hours=YOUTUBE_HANDOFF_LEAD_HOURS)


def ytp1_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "youtube":
        return "not_youtube"
    if _ci(field_str(record, "YouTube_Stage")) != _ci(STAGE_YT1):
        return "youtube_stage_not_yt1"
    if field_str(record, "YouTube_Upload_Job_ID"):
        return "already_has_upload_job"
    if field_str(record, "YouTube_Video_ID"):
        return "already_has_youtube_video"
    if not youtube_handoff_due(record):
        return "youtube_handoff_not_due"
    if not is_public_publish_url(upload_source_url(record)):
        return "missing_public_publish_url"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def yts1_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "YouTube_Stage")) != _ci(STAGE_YT2):
        return "youtube_stage_not_yt2"
    if not field_str(record, "YouTube_Upload_Job_ID"):
        return "missing_upload_job_id"
    if field_str(record, "YouTube_Video_ID"):
        return "already_has_youtube_video"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def yts2_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "YouTube_Stage")) != _ci(STAGE_YT2):
        return "youtube_stage_not_yt2"
    if not field_str(record, "YouTube_Video_ID"):
        return "missing_youtube_video_id"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None


def yts3_eligibility_reason(
    record: dict[str, Any],
    *,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    require_native_cover: bool = True,
) -> str | None:
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "YouTube_Stage")) != _ci(STAGE_YT4):
        return "youtube_stage_not_yt4"
    if not field_str(record, "YouTube_Video_ID"):
        return "missing_youtube_video_id"
    if _ci(field_str(record, "YouTube_Processing_Status")) != "succeeded":
        return "processing_not_succeeded"
    if (
        require_native_cover
        and native_grid_cover_required(record)
        and _ci(field_str(record, "YouTube_Thumbnail_Status")) != "uploaded"
    ):
        return "native_cover_not_uploaded"
    if replace_mismatch(
        record,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    ):
        return "replace_address_mismatch"
    return None
