"""YTS2 — poll YouTube processing and optional thumbnail (Make 5830616)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field_str
from yt.client import (
    YouTubeUploaderClient,
    contains_invalid_grant,
    load_uploader_settings,
    processing_failure_reason,
    processing_status,
)
from yt.common import (
    is_quota_exceeded,
    manual_publish_required_fields,
    preview,
    response_json,
    retry_at,
    valid_record_id,
)
from yt.constants import (
    MAKE_YTS2_ID,
    MAKE_YTS2_NAME,
    PROCESSING_FAILED,
    PROCESSING_PROCESSING,
    PROCESSING_RETRY_MINUTES,
    PROCESSING_SUCCEEDED,
    PUBLISH_STATUS_FAILED,
    RETRY_MINUTES,
    STAGE_TERMINAL,
    STAGE_YT2,
    STAGE_YT4,
    THUMB_PENDING,
    THUMB_UPLOADED,
    UPLOAD_UPLOADED,
)
from yt.eligibility import yts2_eligibility_reason
from yt.package import youtube_thumbnail_publish_enabled


def yts2_needs_videos_list(thumb_publish: bool) -> bool:
    """videos.list is only needed to wait for processing before thumbnails.set."""
    return bool(thumb_publish)


def thumbnail_fallback_source(output: dict[str, Any], *, cover_required: bool) -> str | None:
    if cover_required:
        return None
    return field_str(output, "Clip_1_URL") or field_str(output, "Selected_Clip_1_URL") or None


def vertical_still_attached(body: Any) -> bool:
    """Treat a successful supported thumbnails.set response as cover acceptance.

    Older builds attempted an additional private YouTube Studio youtubei call and
    required its studioVerticalStill payload. The supported Data API returns a
    thumbnailSetResponse with items; that response is now authoritative.
    """
    if not isinstance(body, dict):
        return False
    if body.get("studioVerticalStillError"):
        return False
    if body.get("studioVerticalStill"):
        return True
    if body.get("apiThumbnailAccepted") is True:
        return True
    items = body.get("items")
    return body.get("kind") == "youtube#thumbnailSetResponse" and isinstance(items, list) and bool(items)


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="yts2",
        make_id=MAKE_YTS2_ID,
        make_name=MAKE_YTS2_NAME,
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

    reason = yts2_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    video_id = field_str(output, "YouTube_Video_ID")
    result["eligibility_reason"] = reason
    result["video_id"] = video_id
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    pipeline_settings = PipelineSettings(client)
    thumb_publish = youtube_thumbnail_publish_enabled(pipeline_settings, record=output)
    result["thumbnail_publish"] = thumb_publish
    now = iso_utc()
    if not yts2_needs_videos_list(thumb_publish):
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_YT4,
                "Publish_Next_Retry_At": None,
                "YouTube_Error_Message": "",
                "YouTube_Last_Checked_At": now,
                "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                "YouTube_Processing_Progress_Percent": 100,
                "YouTube_Thumbnail_Status": field_str(output, "YouTube_Thumbnail_Status") or THUMB_PENDING,
            },
        )
        result["needs_finalize"] = True
        result["skipped_videos_list"] = True
        result["youtube_stage"] = STAGE_YT4
        return {"processed": True, **result}
    settings = load_uploader_settings(pipeline_settings, output, client=client)
    uploader = YouTubeUploaderClient(base_url=settings["url"], secret=settings["secret"])
    status_code, body = uploader.video_status(video_id)
    status = processing_status(body).casefold()
    result["http_status"] = status_code
    result["processing_status"] = status
    thumb_status = field_str(output, "YouTube_Thumbnail_Status")
    thumb_url = field_str(output, "Thumbnail_URL")
    from ap0.public_cover import (
        ensure_public_cover_url,
        ensure_youtube_short_cover_url,
        graph_fetchable_cover_url,
        native_grid_cover_required,
    )

    cover_required = native_grid_cover_required(output)
    if (
        thumb_publish
        and 200 <= status_code <= 299
        and status == "succeeded"
        and thumb_status.casefold() != "uploaded"
        and (cover_required or thumb_url)
    ):
        try:
            staged = ensure_youtube_short_cover_url(client, output) if cover_required else ensure_public_cover_url(client, output)
            thumb_url = staged or thumb_url
        except Exception:
            thumb_url = field_str(output, "Thumbnail_URL")
        if cover_required and not graph_fetchable_cover_url(thumb_url):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    "YouTube_Stage": STAGE_YT2,
                    "Publish_Locked_At": None,
                    "Publish_Locked_By": "",
                    "Publish_Error_Stage": "YTS2_THUMBNAIL",
                    "Publish_Error_Message": "YouTube Short needs a public native grid cover before thumbnails.set.",
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "YouTube_Error_Message": "YTS2 missing Graph/YouTube-fetchable Thumbnail_URL.",
                    "YouTube_Response_JSON": response_json(body),
                    "Publish_Retry_Eligible": True,
                    "YouTube_Last_Checked_At": now,
                    "YouTube_Thumbnail_Status": THUMB_PENDING,
                    "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                },
            )
            result["still_processing"] = True
            return {"processed": True, "retry": True, "reason": "missing_native_cover", **result}
        thumb_code, thumb_body = uploader.set_thumbnail(
            video_id=video_id,
            source_url=thumb_url,
            fallback_source_url=thumbnail_fallback_source(output, cover_required=cover_required),
            vertical=cover_required,
        )
        result["thumbnail_http_status"] = thumb_code
        if 200 <= thumb_code <= 299 and (not cover_required or vertical_still_attached(thumb_body)):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    "YouTube_Stage": STAGE_YT4,
                    "Publish_Error_Stage": "",
                    "Publish_Error_Message": "",
                    "Publish_Next_Retry_At": None,
                    "YouTube_Error_Message": "",
                    "YouTube_Response_JSON": response_json(thumb_body),
                    "Publish_Retry_Eligible": False,
                    "YouTube_Last_Checked_At": now,
                    "YouTube_Thumbnail_Status": THUMB_UPLOADED,
                    "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                    "YouTube_Processing_Progress_Percent": 100,
                },
            )
            result["needs_finalize"] = True
            result["youtube_stage"] = STAGE_YT4
            return {"processed": True, **result}
        if 200 <= thumb_code <= 299 and cover_required and not vertical_still_attached(thumb_body):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    "YouTube_Stage": STAGE_YT2,
                    "Publish_Locked_At": None,
                    "Publish_Locked_By": "",
                    "Publish_Error_Stage": "YTS2_VERTICAL_STILL",
                    "Publish_Error_Message": "YouTube Short still needs the vertical 3D cover. Retrying until Studio accepts it.",
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "YouTube_Error_Message": f"YTS2 vertical still missing. HTTP {thumb_code}: {thumb_body}",
                    "YouTube_Response_JSON": response_json(thumb_body),
                    "Publish_Retry_Eligible": True,
                    "YouTube_Last_Checked_At": now,
                    "YouTube_Thumbnail_Status": THUMB_PENDING,
                    "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                },
            )
            result["still_processing"] = True
            return {"processed": True, "retry": True, "reason": "missing_vertical_still", **result}
        if contains_invalid_grant(thumb_body):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                _auth_failure(
                    now,
                    stage="YTS2_AUTH",
                    publish_message="YouTube authentication failed while uploading the thumbnail. Reauthorize the YouTube uploader service before retrying.",
                    youtube_message=f"YTS2 thumbnail OAuth invalid_grant. Reauthorize the YouTube uploader service. HTTP {thumb_code}: {thumb_body}",
                    body=thumb_body,
                    extra={
                        "YouTube_Thumbnail_Status": THUMB_PENDING,
                        "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                    },
                ),
            )
            return {"processed": True, "terminal": True, **result}
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_YT2,
                "Publish_Locked_At": None,
                "Publish_Locked_By": "",
                "Publish_Error_Stage": "YTS2_THUMBNAIL",
                "Publish_Error_Message": "Temporary error uploading YouTube thumbnail.",
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "YouTube_Error_Message": f"YTS2 thumbnail upload/compression failed. HTTP {thumb_code}: {thumb_body}",
                "YouTube_Response_JSON": response_json(thumb_body),
                "Publish_Retry_Eligible": True,
                "YouTube_Last_Checked_At": now,
                "YouTube_Thumbnail_Status": THUMB_PENDING,
                "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
            },
        )
        result["still_processing"] = True
        return {"processed": True, "retry": True, **result}

    if 200 <= status_code <= 299 and status == "succeeded" and (
        (not thumb_publish)
        or thumb_status.casefold() == "uploaded"
        or (not cover_required and not thumb_url)
    ):
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_YT4,
                "Publish_Next_Retry_At": None,
                "YouTube_Error_Message": "",
                "YouTube_Response_JSON": response_json(body),
                "YouTube_Last_Checked_At": now,
                "YouTube_Processing_Status": PROCESSING_SUCCEEDED,
                "YouTube_Processing_Progress_Percent": 100,
            },
        )
        result["needs_finalize"] = True
        result["youtube_stage"] = STAGE_YT4
        return {"processed": True, **result}

    if 200 <= status_code <= 299 and status == "processing":
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "Publish_Next_Retry_At": retry_at(PROCESSING_RETRY_MINUTES),
                "YouTube_Response_JSON": response_json(body),
                "YouTube_Last_Checked_At": now,
                "YouTube_Processing_Status": PROCESSING_PROCESSING,
            },
        )
        result["still_processing"] = True
        return {"processed": True, **result}

    if status in {"failed", "terminated"}:
        failure, rejection = processing_failure_reason(body)
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "YouTube_Stage": STAGE_TERMINAL,
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Locked_At": None,
                "Publish_Locked_By": "",
                "Publish_Error_Stage": "YTS2_PROCESSING",
                "Publish_Error_Message": "YouTube processing failed or was terminated.",
                "Publish_Next_Retry_At": None,
                "YouTube_Error_Message": "YTS2 YouTube processing failed or was terminated.",
                "YouTube_Response_JSON": response_json(body),
                "Publish_Retry_Eligible": False,
                "YouTube_Last_Checked_At": now,
                "YouTube_Rejection_Reason": rejection,
                "YouTube_Processing_Status": PROCESSING_FAILED,
                "YouTube_Processing_Failure_Reason": failure,
            },
        )
        return {"processed": True, "manual_publish_required": True, **result}

    if contains_invalid_grant(body):
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            _auth_failure(
                now,
                stage="YTS2_AUTH",
                publish_message="YouTube authentication failed. Reauthorize the YouTube uploader service before retrying.",
                youtube_message=f"YTS2 OAuth invalid_grant. Reauthorize the YouTube uploader service. HTTP {status_code}: {body}",
                body=body,
            ),
        )
        return {"processed": True, "manual_publish_required": True, **result}

    if is_quota_exceeded(status_code, body) or status_code == 403:
        # Keep the uploaded video id; park until Pacific midnight instead of
        # burning more quota with short retries.
        fields = manual_publish_required_fields(
            error_stage="YTS2_QUOTA",
            publish_message="YouTube API quota exhausted while polling processing. Manual publish required until the next automatic retry after Pacific midnight.",
            youtube_message=f"YTS2 poll blocked by quota/HTTP {status_code}: {body}",
            body=body,
            youtube_stage=STAGE_YT2,
            clear_upload_job=False,
            upload_status=UPLOAD_UPLOADED,
            package_status=None,
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
            "Publish_Error_Stage": "YTS2_POLL",
            "Publish_Error_Message": "Temporary error polling YouTube processing status.",
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "YouTube_Error_Message": f"YTS2 poll failed. HTTP {status_code}: {body}",
            "YouTube_Response_JSON": response_json(body),
            "Publish_Retry_Eligible": True,
            "YouTube_Last_Checked_At": now,
        },
    )
    result["still_processing"] = True
    return {"processed": True, "retry": True, **result}


def _auth_failure(
    now: str,
    *,
    stage: str,
    publish_message: str,
    youtube_message: str,
    body: Any,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fields = manual_publish_required_fields(
        error_stage=stage,
        publish_message=publish_message,
        youtube_message=youtube_message,
        body=body,
        youtube_stage=STAGE_YT2,
        clear_upload_job=False,
        upload_status=UPLOAD_UPLOADED,
        package_status=None,
        extra={"YouTube_Last_Checked_At": now},
    )
    if extra:
        fields.update(extra)
    return fields
