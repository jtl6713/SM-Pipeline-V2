"""FBS1 processor — start Facebook slideshow Remotion render (Make 5816409)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, utc_now
from fbs1.constants import (
    FB_PUBLISH_RENDERING,
    FB_PUBLISH_RETRY,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    PUBLISH_LOCKED_BY,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    RETRY_MINUTES,
    STATUS_RENDERING,
    STATUS_RETRY_PENDING,
    STATUS_STARTING,
)
from fbs1.eligibility import create_eligibility_reason
from fbs1.payload import build_render_payload, expected_image_count
from fbs1.slides import list_ready_slides
from render.fields import field, field_str
from render.settings import get_render_server_url

RECORD_ID_PREFIX = "rec"


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "platform": "Facebook",
        "format": "Slideshow Reel",
    }


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

    reason = create_eligibility_reason(output)
    preview["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **preview}

    slides = list_ready_slides(client, field_str(output, "Output_ID"))
    expected = expected_image_count(output)
    from t1.apply import music_is_enabled
    from t1.constants import DONE_STATUSES
    from t1.processor import process_one as process_t1

    if music_is_enabled(output) and field_str(output, "Timing_Status") not in DONE_STATUSES:
        process_t1(output_record_id=record_id, test_run_id=test_run_id, dry_run=dry_run, client=client)
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    payload = build_render_payload(output, slides)
    preview["slide_count"] = len(slides)
    preview["expected_image_count"] = expected
    preview["render_request"] = payload
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "FB_Slideshow_Attempt_Count"), 0) or 0) + 1
    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": PUBLISH_LOCKED_BY,
            "Publish_Started_At": now,
            "FB_Slideshow_Status": STATUS_STARTING,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
            "FB_Slideshow_Attempt_Count": attempt,
            "FB_Slideshow_Error_Message": "",
        },
        typecast=True,
    )

    if not slides or expected is None or len(slides) != expected:
        _mark_retry(
            client,
            output,
            stage="FBS1_ASSETS",
            message="FBS1 could not build a complete slideshow image set.",
            detail=f"FBS1 found {len(slides)} ready ordered 4:5 slide(s); expected {expected}.",
        )
        return {"processed": False, "reason": "slideshow_asset_mismatch", "attempt_count": attempt, **preview}

    render_base = get_render_server_url(client)
    try:
        response = requests.post(
            f"{render_base}/render",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=300,
        )
        data = response.json() if response.content else {}
        status_code = response.status_code
    except Exception as exc:
        _mark_retry(
            client,
            output,
            stage="FBS1_RENDER_START",
            message="FBS1 could not start the Facebook slideshow render.",
            detail=f"FBS1 render start failed. HTTP : {exc}",
            payload={"error": str(exc)},
        )
        return {"processed": False, "reason": "render_start_failed", "error": str(exc), "attempt_count": attempt, **preview}

    job_id = str(data.get("jobId") or "").strip()
    status_url = str(data.get("statusUrl") or "").strip()
    if not (200 <= status_code <= 299) or not job_id or not status_url:
        _mark_retry(
            client,
            output,
            stage="FBS1_RENDER_START",
            message="FBS1 could not start the Facebook slideshow render.",
            detail=f"FBS1 render start failed. HTTP {status_code}: {data.get('error') or data}",
            payload=data,
        )
        return {
            "processed": False,
            "reason": "render_start_failed",
            "status_code": status_code,
            "attempt_count": attempt,
            **preview,
        }

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "FB_Publish_Status": FB_PUBLISH_RENDERING,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_RENDERING,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": iso_utc(),
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Render_URL": str(data.get("renderUrl") or ""),
            "FB_Slideshow_Error_Message": "",
            "FB_Slideshow_Render_Job_ID": job_id,
            "FB_Slideshow_Last_Checked_At": iso_utc(),
            "FB_Slideshow_Render_Props_JSON": str(data.get("props") or payload),
            "FB_Slideshow_Render_Status_URL": status_url,
        },
        typecast=True,
    )
    return {
        "processed": True,
        "needs_poll": True,
        "attempt_count": attempt,
        "job_id": job_id,
        **preview,
    }


def _mark_retry(
    client: AirtableClient,
    output: dict[str, Any],
    *,
    stage: str,
    message: str,
    detail: str,
    payload: Any = None,
) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": FB_PUBLISH_RETRY,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Started_At": None,
            "FB_Slideshow_Status": STATUS_RETRY_PENDING,
            "Publish_Error_Stage": stage,
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": iso_utc(utc_now() + timedelta(minutes=RETRY_MINUTES)),
            "Publish_Retry_Eligible": True,
            "FB_Slideshow_Error_Message": detail[:1500],
            "FB_Slideshow_Response_JSON": "" if payload is None else str(payload),
        },
        typecast=True,
    )
