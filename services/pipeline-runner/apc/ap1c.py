"""AP1C — create Instagram carousel child containers (Make 5790745)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from apc.assets import child_ids, current_order, list_child_slides, list_final_slides
from apc.common import expected_child_count, preview, response_json, retry_at, unlock_fields, valid_record_id
from apc.constants import (
    CHILD_CREATING,
    CHILD_IN_PROGRESS,
    CHILD_RETRY,
    ERROR_AP1C,
    MAKE_AP1C_ID,
    MAKE_AP1C_NAME,
    RETRY_MINUTES,
    STAGE_AP1C,
    STATUS_ASSETS_READY,
    STATUS_CHILDREN_PROCESSING,
    STATUS_CREATING_CHILDREN,
)
from apc.eligibility import ap1c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, graph_id, http_ok, load_instagram_settings
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field, field_str


def _reset_parent(client: AirtableClient, output: dict[str, Any], message: str) -> None:
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_ASSETS_READY,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": ERROR_AP1C,
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
        stage="ap1c",
        make_id=MAKE_AP1C_ID,
        make_name=MAKE_AP1C_NAME,
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
    reason = ap1c_eligibility_reason(output)
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
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_AP1C,
            "IG_Carousel_Status": STATUS_CREATING_CHILDREN,
            "Publish_Started_At": now,
            "Publish_Attempt_Count": (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1,
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "Last_Publish_Attempt_At": now,
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Next_Retry_At": None,
        },
        typecast=True,
    )

    slides = list_final_slides(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    settings = PipelineSettings(client)
    graph = InstagramCarouselClient(**load_instagram_settings(settings))
    for slide in slides:
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "IG_Child_Container_ID": "",
                "IG_Carousel_Item_Ready": False,
                "IG_Child_Container_Error": "",
                "IG_Child_Container_Status": CHILD_CREATING,
                "IG_Child_Container_Created_At": None,
                "IG_Child_Container_Attempt_Count": (parse_int(field(slide, "IG_Child_Container_Attempt_Count"), 0) or 0) + 1,
                "IG_Child_Container_Response_JSON": "",
                "IG_Child_Container_Last_Checked_At": None,
            },
            typecast=True,
        )
        url = field_str(slide, "IG_Public_Asset_URL")
        try:
            status_code, payload = graph.create_child(url)
        except Exception as exc:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {"IG_Child_Container_Error": "AP1C runtime error while creating a child container.", "IG_Child_Container_Status": CHILD_RETRY},
                typecast=True,
            )
            _reset_parent(client, output, "AP1C runtime error while creating a child container.")
            result.update({"processed": True, "needs_children": True, **{"error": str(exc)}})
            return result
        child_id = graph_id(payload)
        if http_ok(status_code) and child_id:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {
                    "IG_Child_Container_ID": child_id,
                    "IG_Carousel_Item_Ready": False,
                    "IG_Child_Container_Error": "",
                    "IG_Child_Container_Status": CHILD_IN_PROGRESS,
                    "IG_Child_Container_Created_At": iso_utc(),
                    "IG_Child_Container_Response_JSON": response_json(payload),
                    "IG_Child_Container_Last_Checked_At": iso_utc(),
                },
                typecast=True,
            )
            continue
        message = f"AP1C child creation failed for slide {current_order(slide)}. HTTP {status_code}: {error_message(payload, status_code)}"
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "IG_Child_Container_Error": f"AP1C child creation failed. HTTP {status_code}: {error_message(payload, status_code)}",
                "IG_Child_Container_Status": CHILD_RETRY,
                "IG_Child_Container_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        _reset_parent(client, output, message)
        return {"processed": True, "needs_children": True, **result}

    created = list_child_slides(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    created_count = len(child_ids(created))
    expected = expected_child_count(output, created_count)
    if created_count != expected or created_count <= 1:
        _reset_parent(
            client,
            output,
            f"AP1C child-ID verification mismatch. Created/retained: {created_count}; expected: {expected}.",
        )
        return {"processed": True, "needs_children": True, "created_count": created_count, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_CHILDREN_PROCESSING,
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "IG_Carousel_Children_JSON": f'{{"created_count":{created_count},"verified_at":"{iso_utc()}"}}',
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Next_Retry_At": iso_utc(),
            "IG_Carousel_Children_Ready_Count": 0,
            "IG_Carousel_Last_Completed_Stage": STAGE_AP1C,
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_child_poll": True, "created_count": created_count})
    return result
