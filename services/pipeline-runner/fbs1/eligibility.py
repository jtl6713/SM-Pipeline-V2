from __future__ import annotations

from typing import Any

from asset.helpers import as_bool
from fbs1.constants import STATUS_READY_TO_RENDER, STATUS_RENDERING, STATUS_RETRY_PENDING
from render.fields import field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def create_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS1 would lock the output."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "facebook":
        return "not_facebook"
    status = field_str(record, "FB_Slideshow_Status")
    if _ci(status) == _ci(STATUS_RETRY_PENDING) and "fbs1" in _ci(field_str(record, "Publish_Error_Stage")):
        return None
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if _ci(field_str(record, "FB_Resolved_Publish_Mode")) != "slideshow reel":
        return "not_slideshow_reel"
    if _ci(status) != _ci(STATUS_READY_TO_RENDER):
        return "slideshow_status_not_ready_to_render"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    return None


def poll_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS2 would poll the Remotion job."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    status = field_str(record, "FB_Slideshow_Status")
    has_status_url = bool(field_str(record, "FB_Slideshow_Render_Status_URL"))
    if _ci(status) == _ci(STATUS_RENDERING) and has_status_url:
        return None
    if (
        _ci(status) == _ci(STATUS_RETRY_PENDING)
        and "fbs2" in _ci(field_str(record, "Publish_Error_Stage"))
        and has_status_url
    ):
        return None
    if _ci(status) != _ci(STATUS_RENDERING) and _ci(status) != _ci(STATUS_RETRY_PENDING):
        return "slideshow_status_not_rendering"
    if not has_status_url:
        return "missing_slideshow_status_url"
    return "fbs2_retry_stage_mismatch"


def stage_eligibility_reason(record: dict[str, Any]) -> str | None:
    """Return a skip reason, or None when Make FBS2 would stage an existing R5 MP4."""
    if not str(record.get("id") or "").strip():
        return "missing_record_id"
    if _ci(field_str(record, "Platform")) != "facebook":
        return "not_facebook"
    if _ci(field_str(record, "Platform_Output_Type")) != "facebook reel":
        return "not_facebook_reel"
    if _ci(field_str(record, "Output_Status")) != "approved for publishing":
        return "output_not_approved_for_publishing"
    if _ci(field_str(record, "Review_Status")) != "approved":
        return "review_not_approved"
    if not field_str(record, "Final_File_ID"):
        return "missing_final_file_id"
    if field_str(record, "Platform_Post_ID"):
        return "already_has_platform_post"
    if as_bool(record.get("fields", {}).get("Do_Not_Publish"), False):
        return "do_not_publish"
    if field_str(record, "Publish_Asset_URL"):
        return "already_has_publish_asset"
    if field_str(record, "FB_Slideshow_Public_URL"):
        return "already_has_slideshow_public_url"
    return None
