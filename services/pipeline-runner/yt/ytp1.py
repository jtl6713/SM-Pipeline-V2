"""YTP1 — start a resumable YouTube upload (Make 5830810)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import as_bool
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field, field_str
from yt.client import YouTubeUploaderClient, load_uploader_settings
from yt.common import manual_publish_required_fields, preview, response_json, retry_at, valid_record_id
from yt.constants import (
    MAKE_YTP1_ID,
    MAKE_YTP1_NAME,
    PACKAGE_READY,
    PACKAGE_UPLOADING,
    POLL_RETRY_MINUTES,
    PUBLISH_STATUS_PUBLISHING,
    STAGE_YT1,
    STAGE_YT2,
    UPLOAD_UPLOADING,
)
from yt.eligibility import upload_source_url, ytp1_eligibility_reason
from yt.package import youtube_tags


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ytp1",
        make_id=MAKE_YTP1_ID,
        make_name=MAKE_YTP1_NAME,
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

    reason = ytp1_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    source_url = upload_source_url(output)
    result["eligibility_reason"] = reason
    result["source_url"] = source_url
    if reason:
        return {"processed": False, "reason": reason, **result}

    # YouTube requires privacyStatus=private when publishAt is set. Studio keeps
    # YouTube_Privacy_Status as the desired end-state (public for scheduled posts);
    # coerce only the upload payload so the channel releases publicly at publishAt.
    publish_at = field_str(output, "YouTube_Scheduled_Publish_At")
    desired_privacy = field_str(output, "YouTube_Privacy_Status") or "public"
    upload_privacy = "private" if publish_at else desired_privacy
    payload = {
        "sourceUrl": source_url,
        "title": field_str(output, "Output_Title"),
        "description": field_str(output, "YouTube_Description_Final"),
        "tags": youtube_tags(output),
        "categoryId": field_str(output, "YouTube_Category_ID"),
        "privacyStatus": upload_privacy,
        "publishAt": publish_at,
        "madeForKids": as_bool(field(output, "YouTube_Made_For_Kids"), False),
        "containsSyntheticMedia": as_bool(field(output, "YouTube_Contains_Synthetic_Media"), False),
        "idempotencyKey": field_str(output, "YouTube_Idempotency_Key"),
    }
    result["upload_request"] = {key: value for key, value in payload.items() if key != "idempotencyKey"}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    settings = load_uploader_settings(PipelineSettings(client), output, client=client)
    status_code, body = YouTubeUploaderClient(base_url=settings["url"], secret=settings["secret"]).start_upload(payload)
    job_id = str(body.get("id") or "").strip()
    result["http_status"] = status_code
    result["job_id"] = job_id
    now = iso_utc()
    if 200 <= status_code <= 299 and job_id:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_YT2,
                "Publish_Status": PUBLISH_STATUS_PUBLISHING,
                "Publish_Locked_At": None,
                "Publish_Locked_By": "",
                "Publish_Error_Stage": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": retry_at(POLL_RETRY_MINUTES),
                "YouTube_Error_Message": "",
                "YouTube_Response_JSON": response_json(body),
                "YouTube_Upload_Job_ID": job_id,
                "YouTube_Upload_Status": UPLOAD_UPLOADING,
                "Publish_Retry_Eligible": False,
                "YouTube_Package_Status": PACKAGE_UPLOADING,
                "YouTube_Upload_Started_At": now,
                "YouTube_Upload_Progress_Percent": body.get("progressPercent") if body.get("progressPercent") is not None else 0,
            },
        )
        result["needs_poll"] = True
        result["youtube_stage"] = STAGE_YT2
        return {"processed": True, **result}

    # One automatic attempt only. Park for manual publish / Pacific-midnight retry
    # instead of thrashing every few minutes (especially on quotaExceeded).
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        manual_publish_required_fields(
            error_stage="YTP1",
            publish_message="YouTube upload failed. Manual publish required until the next automatic retry after Pacific midnight.",
            youtube_message=f"YTP1 upload initialization failed. HTTP {status_code}: {body}",
            body=body,
            youtube_stage=STAGE_YT1,
            clear_upload_job=True,
            package_status=PACKAGE_READY,
        ),
        typecast=True,
    )
    return {"processed": True, "manual_publish_required": True, **result}
