"""TTD1 — initialize a TikTok photo or video draft (Make 5806644)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from item4.settings import PipelineSettings
from publish.location import resolve_publish_location
from render.fields import field, field_str
from ttd.assets import is_video_route, parse_photo_images, video_source_url
from ttd.client import (
    TikTokDraftClient,
    TikTokDraftError,
    is_capacity_error,
    load_tiktok_settings,
    publish_id_from,
)
from ttd.common import append_note, preview, response_json, retry_at, unlock_fields, valid_record_id
from ttd.constants import (
    CAPACITY_RETRY_MINUTES,
    DRAFT_TYPE_VIDEO,
    INIT_RETRY_MINUTES,
    MAKE_TTD1_ID,
    MAKE_TTD1_NAME,
    MUSIC_MANUAL,
    MUSIC_MODE_MANUAL,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    STAGE_CAPACITY,
    STAGE_TTD1,
    STATUS_INITIALIZING,
    STATUS_MANUAL_FALLBACK,
    STATUS_PROCESSING,
    STATUS_RETRY,
)
from ttd.eligibility import ttd1_eligibility_reason
from ttd.package import photo_description, photo_title


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ttd1",
        make_id=MAKE_TTD1_ID,
        make_name=MAKE_TTD1_NAME,
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

    reason = ttd1_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    result["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **result}

    settings = PipelineSettings(client)
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_TTD1,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "TikTok_Draft_Status": STATUS_INITIALIZING,
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
        },
    )

    try:
        worker = load_tiktok_settings(settings, output, client=client)
        api = TikTokDraftClient(base_url=worker["url"], secret=worker["secret"])
        location = resolve_publish_location(client, output, settings=settings)
        result["location"] = location.as_dict() if location else None
        if is_video_route(output) or field_str(output, "TikTok_Draft_Type").casefold() == DRAFT_TYPE_VIDEO.casefold():
            source_url = video_source_url(output)
            result["draft_kind"] = "video"
            result["source_url"] = source_url
            status_code, body = api.init_video(source_url=source_url)
            stage_prefix = "TTD1_VIDEO_INIT"
        else:
            images = parse_photo_images(output)
            result["draft_kind"] = "photo"
            result["photo_count"] = len(images)
            status_code, body = api.init_photo(
                {
                    "title": photo_title(output),
                    "description": photo_description(output, location=location),
                    "photo_images": images,
                    "photo_cover_index": 0,
                }
            )
            stage_prefix = "TTD1_PHOTO_INIT"
    except TikTokDraftError as exc:
        return _init_failure(
            client,
            output,
            record_id,
            result,
            status_code=exc.status_code,
            body={"error": str(exc)},
            stage=STAGE_TTD1,
            message=str(exc),
            attempt=attempt,
        )

    publish_id = publish_id_from(body)
    result["http_status"] = status_code
    result["publish_id"] = publish_id
    if 200 <= status_code <= 299 and publish_id:
        draft_type = str(body.get("draft_type") or (body.get("data") or {}).get("draft_type") or field_str(output, "TikTok_Draft_Type") or "").strip()
        if field_str(output, "TikTok_Draft_Type").casefold() == DRAFT_TYPE_VIDEO.casefold():
            draft_type = DRAFT_TYPE_VIDEO
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Music_Status": MUSIC_MANUAL,
                "Publish_Status": PUBLISH_STATUS_PUBLISHING,
                "TikTok_Draft_Type": draft_type or field_str(output, "TikTok_Draft_Type"),
                "Music_Handling_Mode": MUSIC_MODE_MANUAL,
                "Publish_Error_Stage": "",
                "TikTok_Draft_Status": STATUS_PROCESSING,
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": now,
                "Publish_Retry_Eligible": False,
                "TikTok_Draft_Publish_ID": publish_id,
                "TikTok_Draft_Response_JSON": response_json(body),
                "TikTok_Draft_Last_Checked_At": None,
                "Platform_Publish_Response_JSON": response_json(body),
                "TikTok_Draft_Poll_Attempt_Count": 0,
            },
        )
        result["needs_poll"] = True
        result["tiktok_draft_status"] = STATUS_PROCESSING
        return {"processed": True, **result}

    capacity = is_capacity_error(body)
    return _init_failure(
        client,
        output,
        record_id,
        result,
        status_code=status_code,
        body=body,
        stage=STAGE_CAPACITY if capacity else STAGE_TTD1 if stage_prefix == STAGE_TTD1 else stage_prefix,
        message=f"TikTok {'video' if result.get('draft_kind') == 'video' else 'photo'} draft initialization failed. HTTP {status_code}: {body}",
        capacity=capacity,
        attempt=attempt,
    )


def _init_failure(
    client: AirtableClient,
    output: dict[str, Any],
    record_id: str,
    result: dict[str, Any],
    *,
    status_code: int,
    body: Any,
    stage: str,
    message: str,
    capacity: bool = False,
    attempt: int = 0,
) -> dict[str, Any]:
    replace = bool(field_str(output, "Replace_Transaction_ID"))
    if replace:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Replace_Error": (
                    "Item6 replacement stopped after ambiguous TikTok draft initialization. "
                    "A draft may already exist; automatic reinitialization is blocked until reconciled."
                ),
                "Replace_State": "Manual Cleanup Required",
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Replace_Updated_At": iso_utc(),
                "Publish_Error_Stage": stage,
                "TikTok_Draft_Status": STATUS_MANUAL_FALLBACK,
                "Publish_Error_Message": message,
                "Publish_Next_Retry_At": None,
                "Replace_Cleanup_State": "Manual Cleanup Required",
                "Publish_Retry_Eligible": False,
                "Manual_Fallback_Required": True,
                "TikTok_Draft_Response_JSON": response_json(body),
            },
        )
        result["manual_fallback"] = True
        return {"processed": True, "terminal": True, **result}

    if status_code in {401, 403} and attempt >= 5:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Output_Notes": append_note(output, f"{stage} authentication failure at {stamp_minutes()}; automatic retries stopped."),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Error_Stage": stage,
                "TikTok_Draft_Status": STATUS_MANUAL_FALLBACK,
                "Publish_Error_Message": message,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Manual_Fallback_Required": True,
                "TikTok_Draft_Response_JSON": response_json(body),
            },
        )
        result["http_status"] = status_code
        result["manual_fallback"] = True
        result["auth_failure"] = True
        return {"processed": True, "terminal": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Output_Notes": append_note(output, f"{stage} runtime failure at {stamp_minutes()}."),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "Publish_Error_Stage": stage,
            "TikTok_Draft_Status": STATUS_RETRY,
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": retry_at(CAPACITY_RETRY_MINUTES if capacity else INIT_RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "TikTok_Draft_Response_JSON": response_json(body),
        },
    )
    result["http_status"] = status_code
    return {"processed": True, "retry": True, **result}
