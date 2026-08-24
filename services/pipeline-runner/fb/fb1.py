"""FB1 — create temporary unpublished Facebook Page photos (Make 5813463)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from fb.assets import list_ready_photos, list_ready_slides, photo_ids, photo_needs_create
from fb.common import preview, response_json, retry_at, unlock_fields, valid_record_id
from fb.constants import (
    DEFAULT_MAX_PHOTOS,
    DEFAULT_UNPUBLISHED_RECREATE_HOURS,
    MAKE_FB1_ID,
    MAKE_FB1_NAME,
    PHOTO_STATUS_CREATING,
    PHOTO_STATUS_READY,
    PHOTO_STATUS_RETRY,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_READY,
    RETRY_MINUTES,
    STAGE_FB1,
    STATUS_CREATING_PHOTO,
    STATUS_PHOTO_READY,
    STATUS_READY_FOR_PHOTO,
    STATUS_RETRY,
)
from fb.eligibility import fb1_eligibility_reason
from fb.graph import FacebookPhotoClient, FacebookPhotoError, load_facebook_page_settings
from item4.settings import PipelineSettings
from render.fields import field, field_str, json_text


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="fb1",
        make_id=MAKE_FB1_ID,
        make_name=MAKE_FB1_NAME,
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

    reason = fb1_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    result["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **result}
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "FB_Publish_Status": STATUS_CREATING_PHOTO,
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_FB1,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    recreate_hours = parse_int(settings.get("FB_UNPUBLISHED_PHOTO_RECREATE_HOURS"), DEFAULT_UNPUBLISHED_RECREATE_HOURS) or DEFAULT_UNPUBLISHED_RECREATE_HOURS
    max_photos = parse_int(settings.get("FB_MAX_PHOTOS"), DEFAULT_MAX_PHOTOS) or DEFAULT_MAX_PHOTOS
    package_rev = field_str(output, "FB_Package_Revision")
    slides = list_ready_slides(client, field_str(output, "Output_ID"), max_photos=max_photos)
    needed = [slide for slide in slides if photo_needs_create(slide, package_rev=package_rev, recreate_hours=recreate_hours)]
    result["needed_count"] = len(needed)
    if not needed:
        ready = list_ready_photos(client, field_str(output, "Output_ID"), package_rev)
        return _commit_photo_progress(client, output, record_id, ready, result)

    try:
        creds = load_facebook_page_settings(settings)
        graph = FacebookPhotoClient(**creds)
    except FacebookPhotoError as exc:
        return _fail_output(client, record_id, result, message=str(exc), payload=exc.payload)

    created = 0
    for slide in needed:
        slide_id = str(slide.get("id") or "")
        url = field_str(slide, "Asset_4x5_Public_URL")
        attempt = (parse_int(field(slide, "FB_Photo_Attempt_Count"), 0) or 0) + 1
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide_id,
            {
                "FB_Photo_Status": PHOTO_STATUS_CREATING,
                "FB_Photo_Attempt_Count": attempt,
                "FB_Photo_Error_Message": "",
                "FB_Photo_Response_JSON": "",
                "FB_Photo_Last_Attempt_At": now,
            },
            typecast=True,
        )
        status_code, data = graph.create_unpublished_photo(url)
        photo_id = str(data.get("id") or "").strip()
        if status_code < 200 or status_code > 299 or not photo_id:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide_id,
                {
                    "FB_Photo_Status": PHOTO_STATUS_RETRY,
                    "FB_Photo_Error_Message": (
                        f"FB1 photo creation failed. HTTP {status_code}: "
                        f"{(data.get('error') or {}).get('message') or data}"
                    ),
                    "FB_Photo_Response_JSON": json_text(data),
                },
                typecast=True,
            )
            return _fail_output(
                client,
                record_id,
                result,
                message=f"FB1 failed creating a Facebook photo object for slide {field(slide, 'Slide Number')}.",
                payload=data,
                slide_number=field(slide, "Slide Number"),
            )
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide_id,
            {
                "FB_Photo_ID": photo_id,
                "FB_Photo_Status": PHOTO_STATUS_READY,
                "FB_Photo_Created_At": iso_utc(),
                "FB_Photo_Error_Message": "",
                "FB_Photo_Response_JSON": json_text(data),
                "FB_Photo_Last_Attempt_At": iso_utc(),
                "FB_Photo_Package_Revision": package_rev,
            },
            typecast=True,
        )
        created += 1

    ready = list_ready_photos(client, field_str(output, "Output_ID"), package_rev)
    result["created_count"] = created
    return _commit_photo_progress(client, output, record_id, ready, result)


def _commit_photo_progress(
    client: AirtableClient,
    output: dict[str, Any],
    record_id: str,
    ready: list[dict[str, Any]],
    result: dict[str, Any],
) -> dict[str, Any]:
    expected = parse_int(field(output, "Image_Count"), 0) or 0
    ids = photo_ids(ready)
    count = len(ids)
    complete = count == expected and count >= 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "FB_Photo_Count": count,
            "Publish_Status": PUBLISH_STATUS_READY,
            "FB_Photo_IDs_JSON": json_text(ids),
            "FB_Publish_Status": STATUS_PHOTO_READY if complete else STATUS_READY_FOR_PHOTO,
            "FB_Last_Checked_At": iso_utc(),
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None if complete else iso_utc(),
            "Publish_Retry_Eligible": False,
        },
        typecast=True,
    )
    result["photo_count"] = count
    result["needs_more"] = not complete
    result["photo_media_ready"] = complete
    result["fb_publish_status"] = STATUS_PHOTO_READY if complete else STATUS_READY_FOR_PHOTO
    return {"processed": True, **result}


def _fail_output(
    client: AirtableClient,
    record_id: str,
    result: dict[str, Any],
    *,
    message: str,
    payload: Any,
    slide_number: Any = None,
) -> dict[str, Any]:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": STATUS_RETRY,
            "Publish_Error_Stage": "FB1_PHOTO_CREATE",
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
        },
        typecast=True,
    )
    result["slide_number"] = slide_number
    result["graph_payload"] = payload
    return {"processed": True, "retry": True, "reason": "photo_create_failed", **result}
