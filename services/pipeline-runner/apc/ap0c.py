"""AP0C — download lettered/public 4:5 images and stage them on R2 (Make 5786899)."""

from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from apc.assets import (
    current_order,
    list_final_slides,
    list_ready_public_assets,
    public_asset_url,
    r2_object_key,
    saved_public_url,
    source_image_url,
)
from apc.common import append_note, expected_child_count, preview, retry_at, unlock_fields, valid_record_id
from apc.constants import (
    ASSET_FAILED,
    ASSET_PREPARING,
    ASSET_READY,
    CHILD_NOT_CREATED,
    DEFAULT_R2_PREFIX,
    ERROR_AP0C,
    MAKE_AP0C_ID,
    MAKE_AP0C_NAME,
    RETRY_MINUTES,
    STAGE_AP0C,
    STATUS_ASSETS_READY,
    STATUS_PREPARING_ASSETS,
    STATUS_RETRY,
)
from apc.eligibility import ap0c_eligibility_reason
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from integrations.r2_upload import R2UploadClient
from item4.settings import PipelineSettings
from render.fields import field, field_str


def _fail_parent(client: AirtableClient, output: dict[str, Any], message: str) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_RETRY,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": ERROR_AP0C,
            "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
            "IG_Carousel_Error_Message": message,
            "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
        },
        typecast=True,
    )


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ap0c",
        make_id=MAKE_AP0C_ID,
        make_name=MAKE_AP0C_NAME,
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

    reason = ap0c_eligibility_reason(output)
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
            "Output_Notes": append_note(output, f"AP0C asset preparation started at {stamp_minutes()}."),
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_AP0C,
            "IG_Carousel_Status": STATUS_PREPARING_ASSETS,
            "Publish_Started_At": now,
            "Publish_Attempt_Count": attempt,
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "Last_Publish_Attempt_At": now,
            "IG_Carousel_Published_At": None,
            "Manual_Fallback_Required": False,
            "IG_Carousel_Children_JSON": "",
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Next_Retry_At": None,
            "IG_Carousel_Parent_Status": "Not Created",
            "IG_Carousel_Package_Revision": "",
            "IG_Carousel_Parent_Created_At": None,
            "IG_Carousel_Published_Media_ID": "",
            "IG_Carousel_Parent_Container_ID": "",
            "IG_Carousel_Children_Ready_Count": 0,
            "IG_Carousel_Last_Completed_Stage": "None",
            "IG_Carousel_Parent_Last_Checked_At": None,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    prefix = settings.get("IG_CAROUSEL_R2_PREFIX") or DEFAULT_R2_PREFIX
    slides = list_final_slides(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    if not slides:
        _fail_parent(client, output, "AP0C found no C9 final slides for this output.")
        return {"processed": True, "needs_assets": True, "ready": False, **result}

    uploader = R2UploadClient()
    for slide in slides:
        source = source_image_url(slide)
        key = r2_object_key(prefix, field(output, "Output_ID"), slide)
        generated = public_asset_url(key)
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "IG_Child_Container_ID": "",
                "IG_Public_Asset_Error": "",
                "IG_Carousel_Item_Ready": False,
                "IG_Public_Asset_Status": ASSET_PREPARING,
                "IG_Child_Container_Error": "",
                "IG_Carousel_Item_Revision": "",
                "IG_Child_Container_Status": CHILD_NOT_CREATED,
                "IG_Child_Container_Created_At": None,
                "IG_Child_Container_Attempt_Count": 0,
                "IG_Child_Container_Response_JSON": "",
                "IG_Child_Container_Last_Checked_At": None,
            },
            typecast=True,
        )
        if not source:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {"IG_Public_Asset_Error": "AP0C could not download the public image URL.", "IG_Public_Asset_Status": ASSET_FAILED},
                typecast=True,
            )
            _fail_parent(client, output, f"AP0C HTTP download runtime failure for slide {current_order(slide)}. Source URL: {source}")
            return {"processed": True, "needs_assets": True, "ready": False, **result}
        try:
            image = requests.get(source, timeout=60)
            if not image.ok or not image.content:
                raise RuntimeError(f"HTTP {image.status_code}")
            uploader.put_object(key, image.content, "image/jpeg")
        except Exception as exc:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {
                    "IG_Public_Asset_Error": f"AP0C could not download or upload the public image URL. Source: {source}",
                    "IG_Public_Asset_Status": ASSET_FAILED,
                },
                typecast=True,
            )
            _fail_parent(client, output, f"AP0C HTTP download runtime failure for slide {current_order(slide)}. Source URL: {source}. {exc}")
            return {"processed": True, "needs_assets": True, "ready": False, **result}

        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "IG_Public_Asset_Key": key,
                "IG_Public_Asset_URL": saved_public_url(source, generated),
                "IG_Public_Asset_Error": "",
                "IG_Carousel_Item_Ready": False,
                "IG_Public_Asset_Status": ASSET_READY,
                "IG_Public_Asset_Ready_At": iso_utc(),
                "IG_Carousel_Item_Revision": f"output-{field(output, 'Output_ID')}|slide-{current_order(slide)}|src-{source}",
            },
            typecast=True,
        )

    ready = list_ready_public_assets(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    ready_count = len(ready)
    expected = expected_child_count(output, ready_count)
    if ready_count != expected or ready_count <= 1:
        _fail_parent(
            client,
            output,
            f"AP0C database verification mismatch. Ready public assets: {ready_count}; expected: {expected}. The output was returned to Retry Pending.",
        )
        return {"processed": True, "needs_assets": True, "ready": False, "ready_count": ready_count, **result}

    verified = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Output_Notes": append_note(output, f"AP0C completed at {stamp_minutes()}. Verified public assets ready: {ready_count}."),
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_ASSETS_READY,
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Child_Count": ready_count,
            "IG_Carousel_Error_Stage": "",
            "Manual_Fallback_Required": False,
            "IG_Carousel_Children_JSON": f'{{"ready_count":{ready_count},"expected_count":{expected},"verified_at":"{verified}"}}',
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Next_Retry_At": "",
            "IG_Carousel_Package_Revision": f"output-{field(output, 'Output_ID')}|ap0c-attempt-{attempt}|ready-{ready_count}",
            "IG_Carousel_Children_Ready_Count": 0,
            "IG_Carousel_Last_Completed_Stage": STAGE_AP0C,
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_children": True, "assets_ready": True, "ready_count": ready_count})
    return result
