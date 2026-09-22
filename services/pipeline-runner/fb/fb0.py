"""FB0 — verify ordered 4:5 assets and route photo vs slideshow (Make 5813436)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from fb.assets import is_slideshow_route, list_ready_slides, package_revision, quoted_url_array
from fb.common import append_note, preview, retry_at, unlock_fields, valid_record_id
from fb.constants import (
    DEFAULT_IMAGE_STAGE_MAX_RETRIES,
    DEFAULT_MAX_PHOTOS,
    MAKE_FB0_ID,
    MAKE_FB0_NAME,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_READY,
    RETRY_MINUTES,
    SLIDESHOW_STATUS_NOT_REQUIRED,
    SLIDESHOW_STATUS_READY_TO_RENDER,
    SLIDESHOW_STATUS_RETRY,
    STAGE_FB0,
    STATUS_PREPARING,
    STATUS_PREPARING_SLIDESHOW,
    STATUS_READY_FOR_PHOTO,
    STATUS_RETRY,
    STATUS_MANUAL_FALLBACK,
)
from fb.eligibility import fb0_eligibility_reason
from item4.settings import PipelineSettings
from render.fields import field, field_str


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="fb0",
        make_id=MAKE_FB0_ID,
        make_name=MAKE_FB0_NAME,
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

    reason = fb0_eligibility_reason(output)
    result["eligibility_reason"] = reason
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
            "Output_Notes": append_note(output, f"FB0 shared 4:5 asset verification started at {stamp_minutes()}."),
            "FB_Publish_Status": STATUS_PREPARING,
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_FB0,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
            "Manual_Fallback_Required": False,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    max_photos = parse_int(settings.get("FB_MAX_PHOTOS"), DEFAULT_MAX_PHOTOS) or DEFAULT_MAX_PHOTOS
    max_retries = parse_int(settings.get("FB_IMAGE_STAGE_MAX_RETRIES"), DEFAULT_IMAGE_STAGE_MAX_RETRIES) or DEFAULT_IMAGE_STAGE_MAX_RETRIES
    requested = parse_int(field(output, "Image_Count"), None)
    expected = min(requested, max_photos) if requested is not None else None
    slideshow_route = is_slideshow_route(output)
    if requested is not None and requested > max_photos:
        normalize = {
            "Image_Count": expected,
            "Output_Notes": append_note(
                output,
                f"FB0 capped Facebook image count from {requested} to {expected} (FB_MAX_PHOTOS={max_photos}) at {stamp_minutes()}.",
            ),
        }
        if not slideshow_route and expected and expected > 1:
            normalize["FB_Image_Publish_Mode"] = "Multi-Photo Collage"
        client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, normalize, typecast=True)

    slides = list_ready_slides(client, field_str(output, "Output_ID"), max_photos=max_photos)
    actual = len(slides)
    result["slide_count"] = actual
    result["requested_image_count"] = requested
    result["expected_image_count"] = expected
    result["image_count_capped"] = bool(requested is not None and requested > max_photos)
    result["slideshow_route"] = slideshow_route

    if actual < 1 or expected is None or actual != expected or actual > max_photos:
        exhausted = attempt >= max_retries
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "FB_Publish_Status": STATUS_MANUAL_FALLBACK if exhausted else STATUS_RETRY,
                "FB_Slideshow_Status": SLIDESHOW_STATUS_RETRY,
                "Publish_Error_Stage": "FB0_ASSETS",
                "Publish_Error_Message": f"FB0 found {actual} ready shared 4:5 assets; expected {expected}.",
                "Publish_Next_Retry_At": None if exhausted else retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": not exhausted,
                "Manual_Fallback_Required": exhausted,
                "FB_Slideshow_Error_Message": "FB0 did not find the expected complete ordered 4:5 asset set.",
            },
            typecast=True,
        )
        return {
            "processed": True,
            "retry": not exhausted,
            "reason": "asset_mismatch_retry_exhausted" if exhausted else "asset_mismatch",
            **result,
        }

    revision = package_revision(slides)
    urls = [field_str(slide, "Asset_4x5_Public_URL") for slide in slides if field_str(slide, "Asset_4x5_Public_URL")]
    if slideshow_route:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Output_Notes": append_note(
                    output,
                    f"FB0 v1.3 routed {actual} ordered shared 4:5 asset(s) to the Facebook Slideshow Reel path at {stamp_minutes()}.",
                ),
                "FB_Photo_Count": 0,
                "Publish_Status": PUBLISH_STATUS_READY,
                "FB_Photo_IDs_JSON": "",
                "FB_Publish_Status": STATUS_PREPARING_SLIDESHOW,
                "Asset_Set_Revision": revision,
                "Assets_Ready_Count": actual,
                "FB_Package_Revision": revision,
                "FB_Post_Fingerprint": "",
                "FB_Slideshow_Status": SLIDESHOW_STATUS_READY_TO_RENDER,
                "Publish_Error_Stage": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "FB_Slideshow_Assets_JSON": quoted_url_array(urls),
                "FB_Slideshow_Attempt_Count": 0,
                "FB_Slideshow_Error_Message": "",
            },
            typecast=True,
        )
        result["needs_slideshow"] = True
        result["fb_publish_status"] = STATUS_PREPARING_SLIDESHOW
        return {"processed": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Output_Notes": append_note(
                output,
                f"FB0 verified {actual} ordered shared 4:5 asset(s) at {stamp_minutes()}.",
            ),
            "FB_Photo_Count": 0,
            "FB_Photo_IDs_JSON": "",
            "FB_Publish_Status": STATUS_READY_FOR_PHOTO,
            "Asset_Set_Revision": revision,
            "Assets_Ready_Count": actual,
            "FB_Package_Revision": revision,
            "FB_Slideshow_Status": SLIDESHOW_STATUS_NOT_REQUIRED,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "FB_Slideshow_Assets_JSON": "",
            "FB_Slideshow_Error_Message": "",
        },
        typecast=True,
    )
    result["needs_photo_media"] = True
    result["fb_publish_status"] = STATUS_READY_FOR_PHOTO
    return {"processed": True, **result}
