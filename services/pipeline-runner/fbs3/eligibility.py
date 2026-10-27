from __future__ import annotations

from typing import Any

from fbs3.caption import public_mp4_url
from fbs3.constants import STATUS_PENDING_FINALIZE, STATUS_PROCESSING, STATUS_RETRY_PENDING, STATUS_VIDEO_READY
from render.fields import field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def video_id(record: dict[str, Any]) -> str:
    return field_str(record, "FB_Slideshow_Meta_Video_ID") or field_str(record, "Platform_Post_ID")


def facebook_graph_publish_held_reason() -> str | None:
    # Make.com is retired. Approved Facebook outputs publish through the
    # native Graph/Python path; the legacy FACEBOOK_AUTO_PUBLISH flag no
    # longer gates production publishing.
    return None


def create_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS3 would lock the output."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    held = facebook_graph_publish_held_reason()
    if held:
        return held
    # Graph 368 posting limits must never become an automatic new-Reel retry.
    # The Quality Agent first waits 48 hours, obtains remote evidence, then
    # returns the item to operator review before new approval can create again.
    stage = _ci(field_str(record, "Publish_Error_Stage"))
    if stage in {"fbs3_rate_limit", "fb_graph_rate_limit", "facebook_story_rate_limit_368"}:
        return "rate_limit_requires_operator_review"
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
    if status not in {"uploading reel", _ci(STATUS_PROCESSING), _ci(STATUS_PENDING_FINALIZE)}:
        return "slideshow_status_not_processing"
    if not video_id(record):
        return "missing_facebook_video_id"
    return None
