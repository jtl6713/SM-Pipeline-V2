"""FB2 — publish the Facebook Page photo post (Make 5813487)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from fb.assets import facebook_message, list_ready_photos, photo_ids, post_fingerprint
from fb.common import preview, response_json, retry_at, unlock_fields, valid_record_id
from fb.constants import (
    MAKE_FB2_ID,
    MAKE_FB2_NAME,
    MODE_SINGLE,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    RETRY_MINUTES,
    STAGE_FB2,
    STATUS_PENDING_FINALIZE,
    STATUS_PUBLISHING,
    STATUS_RECONCILE,
    STATUS_RETRY,
)
from fb.eligibility import fb2_eligibility_reason
from fb.graph import FacebookPhotoClient, FacebookPhotoError, load_facebook_page_settings
from item4.settings import PipelineSettings
from publish.location import resolve_publish_location
from render.fields import field, field_str


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="fb2",
        make_id=MAKE_FB2_ID,
        make_name=MAKE_FB2_NAME,
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

    reason = fb2_eligibility_reason(
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
    attempt = (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "FB_Publish_Status": STATUS_PUBLISHING,
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_FB2,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "Publish_Attempt_Count": attempt,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Last_Publish_Attempt_At": now,
            "FB_Reconcile_Attempt_Count": 0,
            "FB_Reconcile_Response_JSON": "",
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    photos = list_ready_photos(client, field_str(output, "Output_ID"), field_str(output, "FB_Package_Revision"))
    ids = photo_ids(photos)
    expected = parse_int(field(output, "Image_Count"), 0) or 0
    result["photo_count"] = len(ids)
    if len(ids) != expected or len(ids) < 1:
        return _confirmed_failure(
            client,
            record_id,
            result,
            message=f"FB2 expected {expected} ready Facebook photo IDs; found {len(ids)}.",
            payload={"photo_ids": ids},
        )

    message = facebook_message(output)
    fingerprint = post_fingerprint(message, ids)
    page_settings = None
    try:
        page_settings = load_facebook_page_settings(settings, output, client=client)
    except FacebookPhotoError:
        page_settings = None
    location = resolve_publish_location(
        client,
        output,
        settings=settings,
        token=(page_settings or {}).get("token", ""),
        version=(page_settings or {}).get("version", "v25.0"),
    )
    result["location"] = location.as_dict() if location else None
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "FB_Post_Fingerprint": fingerprint,
            "Platform_Publish_Response_JSON": response_json(
                {
                    "prepared_at": now,
                    "photo_count": len(ids),
                    "fingerprint": fingerprint,
                    "location": result["location"],
                }
            ),
        },
        typecast=True,
    )
    result["fingerprint"] = fingerprint
    single = _ci(field_str(output, "FB_Resolved_Publish_Mode")) == _ci(MODE_SINGLE)

    try:
        creds = page_settings or load_facebook_page_settings(settings, output, client=client)
        graph = FacebookPhotoClient(**creds)
        place_id = location.page_id if location else None
        if single:
            source_url = field_str(photos[0], "Asset_4x5_Public_URL")
            image, filename = graph.download_image(source_url)
            status_code, data = graph.publish_single_photo(
                image=image, filename=filename, caption=message, place=place_id
            )
            post_id = str(data.get("post_id") or "").strip()
            media_id = str(data.get("id") or "").strip()
        else:
            status_code, data = graph.publish_attached_media(
                message=message, photo_ids=ids, place=place_id
            )
            post_id = str(data.get("id") or "").strip()
            media_id = post_id
    except FacebookPhotoError as exc:
        if exc.ambiguous or exc.stage == "FB2_AMBIGUOUS":
            return _ambiguous(client, record_id, result, message=str(exc), payload=exc.payload)
        return _confirmed_failure(client, record_id, result, message=str(exc), payload=exc.payload)

    result["http_status"] = status_code
    result["graph_payload"] = data
    if 200 <= status_code <= 299 and post_id:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Platform_Post_ID": post_id,
                "FB_Publish_Status": STATUS_PENDING_FINALIZE,
                "Platform_Media_ID": media_id,
                "Publish_Error_Stage": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Platform_Publish_Response_JSON": response_json(data),
            },
            typecast=True,
        )
        result["needs_finalize"] = True
        result["platform_post_id"] = post_id
        result["fb_publish_status"] = STATUS_PENDING_FINALIZE
        return {"processed": True, **result}
    if 400 <= status_code <= 499:
        return _confirmed_failure(
            client,
            record_id,
            result,
            message=(
                f"FB2 {'Single Photo' if single else 'Attached Media'} publish failed. "
                f"HTTP {status_code}: {(data.get('error') or {}).get('message') or data}"
            ),
            payload=data,
        )
    return _ambiguous(
        client,
        record_id,
        result,
        message=(
            "FB2 returned an ambiguous outcome. FB2R must inspect recent Page posts before any publish retry."
        ),
        payload=data,
    )


def _confirmed_failure(
    client: AirtableClient,
    record_id: str,
    result: dict[str, Any],
    *,
    message: str,
    payload: Any,
) -> dict[str, Any]:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_FAILED,
            "FB_Publish_Status": STATUS_RETRY,
            "Publish_Error_Stage": "FB2_PUBLISH",
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "Platform_Publish_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    return {"processed": True, "retry": True, "reason": "publish_failed", **result}


def _ambiguous(
    client: AirtableClient,
    record_id: str,
    result: dict[str, Any],
    *,
    message: str,
    payload: Any,
) -> dict[str, Any]:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_PUBLISHING,
            "FB_Publish_Status": STATUS_RECONCILE,
            "Publish_Error_Stage": "FB2_AMBIGUOUS",
            "Publish_Error_Message": message,
            "Publish_Next_Retry_At": iso_utc(),
            "Publish_Retry_Eligible": True,
            "FB_Reconcile_Attempt_Count": 0,
            "Platform_Publish_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    result["needs_reconcile"] = True
    result["fb_publish_status"] = STATUS_RECONCILE
    return {"processed": True, **result}
