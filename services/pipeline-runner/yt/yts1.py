"""YTS1 — poll the YouTube upload job (Make 5830609)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field_str
from yt.client import YouTubeUploaderClient, load_uploader_settings, verify_upload_channel
from yt.common import (
    is_quota_exceeded,
    manual_publish_required_fields,
    preview,
    response_json,
    retry_at,
    valid_record_id,
)
from yt.constants import (
    MAKE_YTS1_ID,
    MAKE_YTS1_NAME,
    PACKAGE_READY,
    POLL_RETRY_MINUTES,
    PROCESSING_NOT_STARTED,
    PROCESSING_SUCCEEDED,
    RETRY_MINUTES,
    STAGE_YT1,
    STAGE_YT4,
    THUMB_PENDING,
    UPLOAD_UPLOADED,
    UPLOAD_UPLOADING,
)
from yt.eligibility import yts1_eligibility_reason
from yt.package import youtube_thumbnail_publish_enabled
from yt.yts2 import yts2_needs_videos_list


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="yts1",
        make_id=MAKE_YTS1_ID,
        make_name=MAKE_YTS1_NAME,
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

    reason = yts1_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    job_id = field_str(output, "YouTube_Upload_Job_ID")
    result["eligibility_reason"] = reason
    result["job_id"] = job_id
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    pipeline_settings = PipelineSettings(client)
    settings = load_uploader_settings(pipeline_settings, output, client=client)
    uploader = YouTubeUploaderClient(base_url=settings["url"], secret=settings["secret"])
    status_code, body = uploader.job_status(job_id)
    job_status = str(body.get("status") or "").strip().casefold()
    video_id = str(body.get("videoId") or "").strip()
    result["http_status"] = status_code
    result["job_status"] = job_status
    result["video_id"] = video_id
    now = iso_utc()
    if 200 <= status_code <= 299 and job_status == "completed" and video_id:
        channel_error, upload_theme, expected_channel = verify_upload_channel(
            settings=pipeline_settings,
            output=output,
            client=client,
            uploader=uploader,
            video_id=video_id,
        )
        result["upload_theme"] = upload_theme
        result["expected_channel_id"] = expected_channel
        if channel_error:
            fields = manual_publish_required_fields(
                error_stage="YTS1_CHANNEL_MISMATCH",
                publish_message=channel_error,
                youtube_message=channel_error,
                body=body,
                youtube_stage=STAGE_YT1,
                clear_upload_job=True,
                package_status=PACKAGE_READY,
                extra={
                    "YouTube_Last_Checked_At": now,
                    "YouTube_Video_ID": "",
                    "Platform_Post_ID": "",
                    "Platform_Post_URL": "",
                },
            )
            client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, fields, typecast=True)
            result["channel_mismatch"] = True
            return {"processed": True, "manual_publish_required": True, **result}
        thumb_publish = youtube_thumbnail_publish_enabled(pipeline_settings, record=output)
        skip_list = not yts2_needs_videos_list(thumb_publish)
        fields = {
            "YouTube_Video_ID": video_id,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None if skip_list else retry_at(POLL_RETRY_MINUTES),
            "YouTube_Error_Message": "",
            "YouTube_Response_JSON": response_json(body),
            "YouTube_Upload_Status": UPLOAD_UPLOADED,
            "Publish_Retry_Eligible": False,
            "YouTube_Last_Checked_At": now,
            "YouTube_Processing_Status": PROCESSING_SUCCEEDED if skip_list else PROCESSING_NOT_STARTED,
            "YouTube_Upload_Completed_At": body.get("completedAt") or now,
            "YouTube_Upload_Progress_Percent": 100,
        }
        if skip_list:
            fields["YouTube_Stage"] = STAGE_YT4
            fields["YouTube_Processing_Progress_Percent"] = 100
            if not field_str(output, "YouTube_Thumbnail_Status"):
                fields["YouTube_Thumbnail_Status"] = THUMB_PENDING
        client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, fields)
        result["thumbnail_publish"] = thumb_publish
        result["skipped_videos_list"] = skip_list
        result["needs_processing_poll"] = not skip_list
        result["needs_finalize"] = skip_list
        if skip_list:
            result["youtube_stage"] = STAGE_YT4
        return {"processed": True, **result}
    if 200 <= status_code <= 299 and job_status not in {"completed", "failed"}:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "Publish_Next_Retry_At": retry_at(POLL_RETRY_MINUTES),
                "YouTube_Response_JSON": response_json(body),
                "YouTube_Upload_Status": UPLOAD_UPLOADING,
                "YouTube_Last_Checked_At": now,
                "YouTube_Upload_Progress_Percent": body.get("progressPercent") if body.get("progressPercent") is not None else 0,
            },
        )
        result["still_processing"] = True
        return {"processed": True, **result}
    if 200 <= status_code <= 299 and job_status == "failed":
        # Do not terminal-fail. Park for operator manual publish and auto-retry
        # at the next Pacific midnight (YouTube quota reset).
        fields = manual_publish_required_fields(
            error_stage="YTS1_UPLOAD",
            publish_message="YouTube upload job failed. Manual publish required until the next automatic retry after Pacific midnight.",
            youtube_message=f"YTS1 upload job failed: {body.get('error') or body}",
            body=body,
            youtube_stage=STAGE_YT1,
            clear_upload_job=True,
            package_status=PACKAGE_READY,
            extra={"YouTube_Last_Checked_At": now},
        )
        client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, fields, typecast=True)
        return {"processed": True, "manual_publish_required": True, **result}

    if is_quota_exceeded(status_code, body) or status_code == 403:
        # Uploader may wrap Google 403 as HTTP 500 + "videos.list failed 403".
        fields = manual_publish_required_fields(
            error_stage="YTS1_QUOTA",
            publish_message="YouTube API quota exhausted while polling the upload job. Manual publish required until the next automatic retry after Pacific midnight.",
            youtube_message=f"YTS1 poll blocked by quota/HTTP {status_code}: {body}",
            body=body,
            youtube_stage=STAGE_YT1,
            clear_upload_job=False,
            package_status=PACKAGE_READY,
            extra={"YouTube_Last_Checked_At": now},
        )
        client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, fields, typecast=True)
        return {"processed": True, "manual_publish_required": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Locked_At": None,
            "Publish_Locked_By": "",
            "Publish_Error_Stage": "YTS1_POLL",
            "Publish_Error_Message": "Temporary error polling YouTube upload job.",
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "YouTube_Error_Message": f"YTS1 poll failed. HTTP {status_code}: {body}",
            "YouTube_Response_JSON": response_json(body),
            "Publish_Retry_Eligible": True,
            "YouTube_Last_Checked_At": now,
        },
    )
    result["still_processing"] = True
    return {"processed": True, "retry": True, **result}
