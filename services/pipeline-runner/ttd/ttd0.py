"""TTD0 — prepare TikTok draft photo or video assets (Make 5806658)."""

from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from item4.settings import PipelineSettings
from render.fields import field, field_str
from ap0.eligibility import asset_plan
from ap0.public_mp4 import ensure_public_mp4_url, is_public_publish_url
from ttd.assets import (
    draft_type_for_photos,
    expected_image_count,
    is_photo_route,
    is_video_route,
    list_ready_slides,
    photo_manifest,
    photo_urls,
    video_manifest,
    video_source_url,
)
from ttd.common import append_note, preview, retry_at, unlock_fields, valid_record_id
from ttd.constants import (
    DEFAULT_MAX_PHOTOS,
    DRAFT_TYPE_VIDEO,
    MAKE_TTD0_ID,
    MAKE_TTD0_NAME,
    MUSIC_MANUAL,
    MUSIC_MODE_MANUAL,
    MUSIC_NOT_REQUESTED,
    MUSIC_NOT_REQUIRED,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_READY,
    RETRY_MINUTES,
    STAGE_TTD0,
    STATUS_PREPARING,
    STATUS_READY_FOR_DELIVERY,
    STATUS_RETRY,
    VIDEO_RETRY_MINUTES,
)
from ttd.eligibility import ttd0_eligibility_reason


def _music_fields(record: dict[str, Any]) -> dict[str, str]:
    mode = field_str(record, "Music_Handling_Mode") or MUSIC_MODE_MANUAL
    status = MUSIC_NOT_REQUIRED if mode == MUSIC_NOT_REQUESTED else MUSIC_MANUAL
    return {"Music_Handling_Mode": mode, "Music_Status": status}


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ttd0",
        make_id=MAKE_TTD0_ID,
        make_name=MAKE_TTD0_NAME,
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

    reason = ttd0_eligibility_reason(output)
    photo = is_photo_route(output)
    video = is_video_route(output)
    result["eligibility_reason"] = reason
    result["photo_route"] = photo
    result["video_route"] = video
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
            "Output_Notes": append_note(output, f"TTD0 asset preparation started at {stamp_minutes()}."),
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_TTD0,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "TikTok_Draft_Status": STATUS_PREPARING,
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
        },
    )

    settings = PipelineSettings(client)
    max_photos = parse_int(settings.get("TIKTOK_DRAFT_MAX_PHOTOS"), DEFAULT_MAX_PHOTOS) or DEFAULT_MAX_PHOTOS
    if photo:
        slides = list_ready_slides(client, field_str(output, "Output_ID"), max_photos=max_photos)
        urls = photo_urls(slides)
        actual = len(urls)
        expected = expected_image_count(output, actual)
        result["slide_count"] = actual
        result["expected_image_count"] = expected
        if actual < 1 or actual > max_photos or (expected is not None and actual != expected):
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    **unlock_fields(),
                    "Output_Notes": append_note(output, f"TTD0 asset verification mismatch at {stamp_minutes()}."),
                    "Publish_Status": PUBLISH_STATUS_FAILED,
                    "Publish_Error_Stage": "TTD0_ASSETS",
                    "TikTok_Draft_Status": STATUS_RETRY,
                    "Publish_Error_Message": (
                        f"TTD0 aggregated {actual} ready 9:16 slide(s); expected "
                        f"{expected if expected is not None else 'an approved nonzero count'}. "
                        "Confirm every linked TikTok slide has Asset_9x16_Public_Status = Ready "
                        "and a nonblank Asset_9x16_Public_URL."
                    ),
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "Publish_Retry_Eligible": True,
                    "TikTok_Draft_Assets_JSON": "",
                },
            )
            return {"processed": True, "retry": True, "reason": "asset_mismatch", **result}

        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                **_music_fields(output),
                "Image_Count": actual,
                "Output_Notes": append_note(
                    output,
                    f"TTD0 v1.2.4 prepared {actual} ordered 9:16 TikTok photo asset(s) "
                    f"and stored a stable quoted JSON string array at {stamp_minutes()}.",
                ),
                "Publish_Status": PUBLISH_STATUS_READY,
                "TikTok_Draft_Type": draft_type_for_photos(actual),
                "Publish_Error_Stage": "",
                "TikTok_Draft_Status": STATUS_READY_FOR_DELIVERY,
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "TikTok_Draft_Assets_JSON": photo_manifest(urls),
            },
        )
        result["needs_init"] = True
        result["tiktok_draft_status"] = STATUS_READY_FOR_DELIVERY
        return {"processed": True, **result}

    if video:
        source_url = video_source_url(output)
        if not is_public_publish_url(source_url):
            try:
                plan = asset_plan(output)
                source_url = ensure_public_mp4_url(client, output, plan)
                client.update_record(
                    PLATFORM_OUTPUTS_TABLE,
                    record_id,
                    {
                        "Publish_Asset_URL": source_url,
                        "Publish_Asset_File_Name": plan["publish_asset_file_name"],
                        "Publish_Asset_Host": "Cloudflare R2",
                    },
                    typecast=True,
                )
            except Exception as exc:
                client.update_record(
                    PLATFORM_OUTPUTS_TABLE,
                    record_id,
                    {
                        **unlock_fields(),
                        "Output_Notes": append_note(
                            output,
                            f"TTD0 public MP4 stage failed at {stamp_minutes()}. {type(exc).__name__}: {exc}",
                        ),
                        "Publish_Status": PUBLISH_STATUS_FAILED,
                        "Publish_Error_Stage": "TTD0_VIDEO_ASSET",
                        "TikTok_Draft_Status": STATUS_RETRY,
                        "Publish_Error_Message": (
                            f"TikTok video is on the private master bucket; public CDN copy failed. {exc}"
                        ),
                        "Publish_Next_Retry_At": retry_at(VIDEO_RETRY_MINUTES),
                        "Publish_Retry_Eligible": True,
                    },
                )
                return {"processed": True, "retry": True, "reason": "video_public_stage_failed", **result}
        result["source_url"] = source_url
        try:
            response = requests.get(source_url, headers={"Range": "bytes=0-0"}, timeout=60)
            status_code = response.status_code
        except requests.RequestException as exc:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    **unlock_fields(),
                    "Output_Notes": append_note(
                        output,
                        f"TTD0_VIDEO_VALIDATE runtime failure at {stamp_minutes()}. {type(exc).__name__}: {exc}",
                    ),
                    "Publish_Status": PUBLISH_STATUS_FAILED,
                    "Publish_Error_Stage": "TTD0_VIDEO_VALIDATE",
                    "TikTok_Draft_Status": STATUS_RETRY,
                    "Publish_Error_Message": f"TTD0_VIDEO_VALIDATE runtime failure. {type(exc).__name__}: {exc}",
                    "Publish_Next_Retry_At": retry_at(VIDEO_RETRY_MINUTES),
                    "Publish_Retry_Eligible": True,
                    "TikTok_Draft_Response_JSON": response_error(type(exc).__name__, str(exc)),
                },
            )
            return {"processed": True, "retry": True, "reason": "video_validate_error", **result}

        result["http_status"] = status_code
        if status_code < 200 or status_code > 399:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    **unlock_fields(),
                    "Publish_Status": PUBLISH_STATUS_FAILED,
                    "Publish_Error_Stage": "TTD0_VIDEO_ASSET",
                    "TikTok_Draft_Status": STATUS_RETRY,
                    "Publish_Error_Message": f"TikTok video asset validation returned HTTP {status_code}.",
                    "Publish_Next_Retry_At": retry_at(VIDEO_RETRY_MINUTES),
                    "Publish_Retry_Eligible": True,
                },
            )
            return {"processed": True, "retry": True, "reason": "video_asset_http", **result}

        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                **_music_fields(output),
                "Output_Notes": append_note(output, f"TTD0 validated the public video draft asset at {stamp_minutes()}."),
                "Publish_Status": PUBLISH_STATUS_READY,
                "TikTok_Draft_Type": DRAFT_TYPE_VIDEO,
                "Publish_Error_Stage": "",
                "TikTok_Draft_Status": STATUS_READY_FOR_DELIVERY,
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "TikTok_Draft_Assets_JSON": video_manifest(source_url),
            },
        )
        result["needs_init"] = True
        result["tiktok_draft_status"] = STATUS_READY_FOR_DELIVERY
        return {"processed": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "Publish_Error_Stage": "TTD0_ROUTE",
            "TikTok_Draft_Status": STATUS_RETRY,
            "Publish_Error_Message": (
                "TTD0 found neither a TikTok Draft 9:16 photo set nor a public media.chicagoshining.com video URL."
            ),
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
        },
    )
    return {"processed": True, "retry": True, "reason": "no_asset_route", **result}


def response_error(error_type: str, message: str) -> str:
    from ttd.common import response_json

    return response_json({"runtime_error_type": error_type, "runtime_error_message": message})
