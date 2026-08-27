"""AP0 processor — Drive final MP4 to public R2 (Make 5612096).

Does not pulse Instagram / Facebook / TikTok / YouTube publishers.
"""

from __future__ import annotations

import json
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from ap0.constants import ASSET_HOST, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from ap0.eligibility import asset_plan, eligibility_reason
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from ap0.public_mp4 import ensure_public_mp4_url
from render.fields import field, field_str

RECORD_ID_PREFIX = "rec"


def _append_notes(existing: str, paragraph: str) -> str:
    base = (existing or "").rstrip()
    if not base:
        return paragraph
    return f"{base}\n\n{paragraph}"


def _preview(*, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": False,
    }


def _mark_failed(client: AirtableClient, output: dict[str, Any], message: str) -> None:
    notes = _append_notes(
        field_str(output, "Output_Notes"),
        f"AP0 Worker/R2 upload failed at {stamp_minutes()}. {message}",
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Asset_Error_Message": message,
            "Publish_Error_Message": message,
            "Publish_Retry_Eligible": True,
            "Output_Notes": notes,
        },
        typecast=True,
    )


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
    output_test = field_str(output, "Test_Run_ID")
    if test_run_id and output_test != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **preview}

    plan = asset_plan(output)
    reason = eligibility_reason(output)
    preview.update(plan)
    preview["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    started_notes = _append_notes(
        field_str(output, "Output_Notes"),
        f"AP0 publish asset prep started at {stamp_minutes()}. Target object: {plan['r2_object_key']}",
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            "Publish_Attempt_Count": attempt,
            "Last_Publish_Attempt_At": iso_utc(),
            "Publish_Asset_Error_Message": "",
            "Output_Notes": started_notes,
        },
        typecast=True,
    )
    output["fields"] = {**(output.get("fields") or {}), "Output_Notes": started_notes}

    try:
        public_url = ensure_public_mp4_url(client, output, plan)
        upload = {"ok": True, "public_url": public_url, "key": plan["r2_object_key"]}
    except Exception as exc:
        message = f"AP0 Worker/R2 upload failed. {exc}"
        _mark_failed(client, output, message[:1500])
        raise

    file_name = plan["publish_asset_file_name"]
    ready_notes = _append_notes(
        field_str(output, "Output_Notes"),
        (
            f"AP0 publish asset staged at {stamp_minutes()}.\n"
            f"R2 object: {plan['r2_object_key']}\n"
            f"Publish asset file name: {file_name}\n"
            f"Publish asset URL: {public_url}"
        ),
    )
    response_text = (
        "AP0 Worker/R2 upload response status: 200\n"
        f"Object key: {plan['r2_object_key']}\n"
        f"Public URL: {public_url}\n"
        f"Worker response: {json.dumps(upload, default=str)}"
    )
    patch = {
            "Publish_Asset_Error_Message": "",
            "Publish_Asset_Host": ASSET_HOST,
            "Publish_Asset_File_Name": file_name,
            "Platform_Publish_Response_JSON": response_text,
            "Publish_Asset_URL": public_url,
            "Publish_Asset_Ready_At": iso_utc(),
            "Output_Notes": ready_notes,
        }
    if str(field_str(output, "Platform") or "").casefold() == "facebook":
        patch["FB_Slideshow_Public_URL"] = public_url
        patch["FB_Slideshow_Status"] = "Video Ready"
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        patch,
        typecast=True,
    )
    return {
        "processed": True,
        "bytes": None,
        "attempt_count": attempt,
        **preview,
        **plan,
    }
