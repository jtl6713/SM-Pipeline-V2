"""YT0 — validate and prepare a YouTube package (Make 5823572)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from item4.settings import PipelineSettings
from publish.location import resolve_publish_location
from render.fields import field, field_str
from yt.common import preview, valid_record_id
from yt.constants import (
    MAKE_YT0_ID,
    MAKE_YT0_NAME,
    PACKAGE_FAILED,
    PACKAGE_READY,
    PACKAGE_VALIDATING,
    PUBLISH_LOCKED_BY,
    PUBLISH_STATUS_FAILED,
    STAGE_TERMINAL,
    STAGE_YT0,
    STAGE_YT1,
    UPLOAD_FAILED,
    UPLOAD_READY,
)
from yt.eligibility import package_source_url, yt0_eligibility_reason
from yt.package import package_fields, youtube_defaults


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="yt0",
        make_id=MAKE_YT0_ID,
        make_name=MAKE_YT0_NAME,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
    )
    record_id = str(output_record_id or "").strip()
    if not valid_record_id(record_id):
        return {"processed": False, "reason": "missing_output_record_id", **result}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if test_run_id and field_str(output, "Test_Run_ID") != test_run_id:
        return {"processed": False, "reason": "test_run_mismatch", **result}

    reason = yt0_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    source_url = package_source_url(output)
    title = field_str(output, "Output_Title")
    result["eligibility_reason"] = reason
    result["source_url"] = source_url
    result["has_title"] = bool(title)
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "YouTube_Stage": STAGE_YT0,
            "Publish_Locked_At": now,
            "Publish_Locked_By": PUBLISH_LOCKED_BY,
            "Publish_Started_At": field_str(output, "Publish_Started_At") or now,
            "Publish_Error_Stage": "",
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "YouTube_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "YouTube_Package_Status": PACKAGE_VALIDATING,
            "Last_Publish_Attempt_At": now,
        },
    )

    if not source_url or not title:
        message = "YT0 requires Output_Title and a completed Final_File_URL or Public_Publish_Asset_URL."
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_TERMINAL,
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Locked_At": None,
                "Publish_Locked_By": "",
                "Publish_Error_Stage": "YT0",
                "Publish_Error_Message": message,
                "YouTube_Error_Message": message,
                "YouTube_Upload_Status": UPLOAD_FAILED,
                "YouTube_Package_Status": PACKAGE_FAILED,
            },
        )
        return {"processed": True, "terminal": True, "reason": "invalid_package", **result}

    defaults = youtube_defaults(PipelineSettings(client))
    settings = PipelineSettings(client)
    location = resolve_publish_location(client, output, settings=settings)
    result["location"] = location.as_dict() if location else None
    notes = field_str(output, "Output_Notes")
    stamp = f"YT0 YouTube package validated at {stamp_minutes()}."
    if location:
        stamp = f"{stamp} Location in description: {location.label}."
    fields = package_fields(
        output, defaults, source_url=source_url, prepared_at=now, location=location
    )
    fields.update(
        {
            "Output_Notes": f"{notes}\n\n{stamp}".strip() if notes else stamp,
            "YouTube_Stage": STAGE_YT1,
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Error_Message": "",
            "YouTube_Error_Message": "",
            "YouTube_Upload_Status": UPLOAD_READY,
            "YouTube_Package_Status": PACKAGE_READY,
        }
    )
    client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, fields)
    result["needs_upload"] = True
    result["youtube_stage"] = STAGE_YT1
    return {"processed": True, **result}
