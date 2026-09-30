"""AP3C — create Instagram carousel parent container (Make 5791273)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from apc.assets import child_ids, list_finished_children
from apc.common import (
    clamp_ig_graph_children,
    expected_child_count,
    preview,
    publish_caption,
    response_json,
    retry_at,
    unlock_fields,
    valid_record_id,
)
from apc.constants import (
    ERROR_AP3C,
    IG_GRAPH_MAX_CHILDREN,
    MAKE_AP3C_ID,
    MAKE_AP3C_NAME,
    PARENT_IN_PROGRESS,
    RETRY_MINUTES,
    STAGE_AP3C,
    STATUS_CHILDREN_PROCESSING,
    STATUS_CHILDREN_READY,
    STATUS_CREATING_PARENT,
    STATUS_PARENT_PROCESSING,
)
from apc.eligibility import ap3c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, graph_id, http_ok, load_instagram_settings
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
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
        stage="ap3c",
        make_id=MAKE_AP3C_ID,
        make_name=MAKE_AP3C_NAME,
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
    reason = ap3c_eligibility_reason(output)
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
            "Publish_Locked_By": STAGE_AP3C,
            "IG_Carousel_Status": STATUS_CREATING_PARENT,
            "Publish_Started_At": now,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "IG_Carousel_Error_Message": "",
        },
        typecast=True,
    )

    children = list_finished_children(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    requested_count = len(child_ids(children))
    children, capped = clamp_ig_graph_children(children, IG_GRAPH_MAX_CHILDREN)
    ids = child_ids(children)
    expected = expected_child_count(output, len(ids))
    if capped or expected > IG_GRAPH_MAX_CHILDREN:
        # Graph rejects >10 attachments (#100). Keep cover/order-1 through slide 10.
        expected = len(ids)
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "IG_Carousel_Child_Count": expected,
                "Image_Count": expected,
                "Output_Notes": (
                    f"{field_str(output, 'Output_Notes')}\n\n"
                    f"AP3C clamped Instagram carousel children from {requested_count} to {expected} "
                    f"(Graph max {IG_GRAPH_MAX_CHILDREN}; keep cover as slide 1)."
                ).strip(),
            },
            typecast=True,
        )
        result["children_capped"] = True
        result["requested_child_count"] = requested_count
        result["expected_child_count"] = expected
    if len(ids) != expected or len(ids) <= 1:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_CHILDREN_PROCESSING,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP3C,
                "IG_Carousel_Error_Message": (
                    f"AP3C ordered FINISHED child count mismatch. Found {len(ids)}; expected {expected}."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            },
            typecast=True,
        )
        return {"processed": True, "needs_child_poll": True, **result}

    try:
        graph = InstagramCarouselClient(**load_instagram_settings(PipelineSettings(client), output, client=client))
        status_code, payload = graph.create_parent(children=ids, caption=publish_caption(output))
    except Exception:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_CHILDREN_READY,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP3C,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": "AP3C runtime error while creating parent container.",
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            },
            typecast=True,
        )
        return {"processed": True, "needs_parent": True, **result}

    parent_id = graph_id(payload)
    if http_ok(status_code) and parent_id:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PARENT_PROCESSING,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": "",
                "IG_Carousel_Error_Message": "",
                "IG_Carousel_Next_Retry_At": None,
                "IG_Carousel_Parent_Status": PARENT_IN_PROGRESS,
                "IG_Carousel_Parent_Created_At": iso_utc(),
                "IG_Carousel_Parent_Container_ID": parent_id,
                "IG_Carousel_Last_Completed_Stage": STAGE_AP3C,
                "IG_Carousel_Parent_Response_JSON": response_json(payload),
                "IG_Carousel_Parent_Last_Checked_At": iso_utc(),
                "IG_Carousel_Parent_Poll_Attempt_Count": 0,
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_parent_poll": True, "parent_id": parent_id})
        return result

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_CHILDREN_READY,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": ERROR_AP3C,
            "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
            "IG_Carousel_Error_Message": f"AP3C parent creation failed. HTTP {status_code}: {error_message(payload, status_code)}",
            "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            "IG_Carousel_Parent_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    return {"processed": True, "needs_parent": True, **result}
