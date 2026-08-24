from __future__ import annotations

from typing import Any

from fbs3.caption import public_mp4_url
from fbs3.constants import STATUS_PENDING_FINALIZE, STATUS_PROCESSING, STATUS_RETRY_PENDING, STATUS_VIDEO_READY
from render.fields import field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def video_id(record: dict[str, Any]) -> str:
    return field_str(record, "FB_Slideshow_Meta_Video_ID") or field_str(record, "Platform_Post_ID")


def create_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS3 would lock the output."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    status = field_str(record, "FB_Slideshow_Status")
    if _ci(status) == _ci(STATUS_VIDEO_READY) and public_mp4_url(record):
        return None
    if _ci(status) == _ci(STATUS_RETRY_PENDING) and "fbs3" in _ci(field_str(record, "Publish_Error_Stage")):
        return None
    if _ci(status) != _ci(STATUS_VIDEO_READY) and _ci(status) != _ci(STATUS_RETRY_PENDING):
        return "slideshow_status_not_ready"
    if _ci(status) == _ci(STATUS_VIDEO_READY) and not public_mp4_url(record):
        return "missing_slideshow_public_url"
    return "fbs3_retry_stage_mismatch"


def poll_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS4 would poll the Reel."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    status = _ci(field_str(record, "FB_Slideshow_Status"))
    if status not in {_ci(STATUS_PROCESSING), _ci(STATUS_PENDING_FINALIZE)}:
        return "slideshow_status_not_processing"
    if not video_id(record):
        return "missing_facebook_video_id"
    return None
