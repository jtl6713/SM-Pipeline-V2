"""FBS4 processor — Facebook Reel poll + finalize (Make 5816520)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, utc_now
from fbs3.constants import (
    FB_PUBLISH_PUBLISHED,
    MAKE_POLL_SCENARIO_ID,
    MAKE_POLL_SCENARIO_NAME,
    POLL_LOCKED_BY,
    POLL_RETRY_MINUTES,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHED,
    STATUS_FAILED,
    STATUS_PENDING_FINALIZE,
    STATUS_PROCESSING,
    STATUS_PUBLISHED,
)
from fbs3.eligibility import poll_eligibility_reason, video_id as reel_video_id
from fbs3.graph import FacebookReelClient, FacebookReelError, load_facebook_reel_settings
from item4.settings import PipelineSettings
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_POLL_SCENARIO_ID,
        "make_scenario_name": MAKE_POLL_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "Facebook",
        "format": "Reel",
    }


def _phase_status(status: Any, key: str) -> str:
    if not isinstance(status, dict):
        return ""
    phase = status.get(key)
    if isinstance(phase, dict):
        return _ci(phase.get("status"))
    return _ci(phase)


def reel_is_ready(data: dict[str, Any]) -> bool:
    if str(data.get("permalink_url") or "").strip():
        return True
    status = data.get("status") if isinstance(data.get("status"), dict) else {}
    if _phase_status(status, "publishing_phase") == "complete":
        return True
    return _ci(status.get("video_status")) == "ready"


def reel_permalink(data: dict[str, Any], video_id: str) -> str:
    post_id = str(data.get("id") or video_id).strip() or video_id
    return f"https://www.facebook.com/reel/{post_id}/"


def reel_is_terminal_error(data: dict[str, Any], status_code: int) -> bool:
    if 400 <= status_code <= 499:
        return True
    status = data.get("status") if isinstance(data.get("status"), dict) else {}
    if _ci(status.get("video_status")) == "error":
        return True
    return _phase_status(status, "processing_phase") == "error" or _phase_status(status, "publishing_phase") == "error"


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = _preview(output_record_id=output_record_id, test_run_id=test_run_id)
    record_id = str(output_record_id or "").strip()
    if not record_id or not record_id.startswith(RECORD_ID_PREFIX) or len(record_id) != 17:
        return {"processed": False, "reason": "missing_output_record_id", **preview}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if test_run_id and field_str(output, "Test_Run_ID") != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **preview}

    reason = poll_eligibility_reason(output)
    video_id = reel_video_id(output)
    preview["eligibility_reason"] = reason
    preview["video_id"] = video_id
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "FB_Slideshow_Attempt_Count"), 0) or 0) + 1
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": POLL_LOCKED_BY,
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Attempt_Count": attempt,
            "FB_Slideshow_Last_Checked_At": now,
        },
        typecast=True,
    )

    try:
        settings = load_facebook_reel_settings(PipelineSettings(client))
        graph = FacebookReelClient(
            page_id=settings["page_id"],
            token=settings["token"],
            version=settings["version"],
        )
        status_code, data = graph.video_status(video_id)
    except FacebookReelError as exc:
        _mark_still_processing(client, output, {"error": str(exc), "payload": exc.payload}, attempt)
        return {"processed": True, "still_processing": True, "error": str(exc), **preview}

    if reel_is_ready(data):
        # Cover attach is best-effort. Holding still_processing here left already-live
        # reels (and Publish_Status=Published zombies) burning the FBS4 cron budget so
        # Published Pending Finalize rows never got a poll slot.
        thumbnail_ok = _attach_thumbnail(graph, client, output, video_id)
        permalink = reel_permalink(data, video_id)
        _mark_published(client, output, video_id, data, permalink=permalink, thumbnail_ok=thumbnail_ok)
        return {
            "processed": True,
            "video_id": video_id,
            "permalink": permalink,
            "thumbnail_ok": thumbnail_ok,
            **preview,
        }
    if reel_is_terminal_error(data, status_code):
        _mark_failed(client, output, video_id, status_code, data)
        return {"processed": False, "reason": "reel_terminal", "status_code": status_code, **preview}

    _mark_still_processing(client, output, data, attempt, status_code=status_code)
    return {"processed": True, "still_processing": True, "status_code": status_code, **preview}


def _attach_thumbnail(graph: FacebookReelClient, client: AirtableClient, output: dict[str, Any], video_id: str) -> bool:
    from ap0.public_cover import ensure_public_cover_url, graph_fetchable_cover_url

    try:
        ensure_public_cover_url(client, output)
    except Exception:
        return False
    thumbnail_url = graph_fetchable_cover_url(field_str(output, "Thumbnail_URL"))
    if not thumbnail_url:
        return False
    try:
        graph.attach_thumbnail(video_id, thumbnail_url)
        return True
    except Exception:
        return False


def _published_at(data: dict[str, Any]) -> str:
    created = str(data.get("created_time") or "").strip()
    return created or iso_utc()


def _unlock_base() -> dict[str, Any]:
    return {
        "Publish_Locked_At": None,
        "Publish_Locked_By": "",
        "Publish_Started_At": None,
        "FB_Slideshow_Last_Checked_At": iso_utc(),
    }


def _mark_published(
    client: AirtableClient,
    output: dict[str, Any],
    video_id: str,
    data: dict[str, Any],
    *,
    permalink: str,
    thumbnail_ok: bool,
) -> None:
    post_id = str(data.get("id") or video_id).strip() or video_id
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **_unlock_base(),
            "Publish_Status": PUBLISH_STATUS_PUBLISHED,
            "Output_Status": PUBLISH_STATUS_PUBLISHED,
            "FB_Publish_Status": FB_PUBLISH_PUBLISHED,
            "FB_Slideshow_Status": STATUS_PUBLISHED,
            "Platform_Post_ID": post_id,
            "Platform_Post_URL": permalink,
            "Published_At": _published_at(data),
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "Manual_Fallback_Required": False,
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Meta_Video_ID": post_id,
            "FB_Slideshow_Response_JSON": (
                f"{data} Native grid cover attach: {'ok' if thumbnail_ok else 'failed'}."
            ),
        },
        typecast=True,
    )


def _mark_failed(
    client: AirtableClient,
    output: dict[str, Any],
    video_id: str,
    status_code: int,
    data: dict[str, Any],
) -> None:
    message = (
        (data.get("error") or {}).get("message")
        if isinstance(data.get("error"), dict)
        else str(data.get("error") or data.get("status") or f"HTTP {status_code}")
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **_unlock_base(),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": STATUS_FAILED,
            "FB_Slideshow_Status": STATUS_FAILED,
            "Publish_Error_Stage": "FBS4",
            "Publish_Error_Message": "Facebook Reel processing failed.",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Manual_Fallback_Required": True,
            "FB_Slideshow_Error_Message": f"FBS4 terminal. HTTP {status_code}: {message}"[:1500],
            "FB_Slideshow_Response_JSON": str(data),
            "FB_Slideshow_Meta_Video_ID": video_id,
        },
        typecast=True,
    )


def _mark_still_processing(
    client: AirtableClient,
    output: dict[str, Any],
    data: dict[str, Any],
    attempt: int,
    *,
    status_code: int | str = "",
) -> None:
    current = field_str(output, "FB_Slideshow_Status")
    keep = STATUS_PENDING_FINALIZE if _ci(current) == _ci(STATUS_PENDING_FINALIZE) else STATUS_PROCESSING
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **_unlock_base(),
            "FB_Slideshow_Status": keep,
            "Publish_Retry_Eligible": True,
            "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=POLL_RETRY_MINUTES)),
            "FB_Slideshow_Attempt_Count": attempt,
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Response_JSON": f"FBS4 still processing HTTP {status_code}: {data}",
        },
        typecast=True,
    )
