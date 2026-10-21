"""AP1C — create Instagram carousel child containers (Make 5790745)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from apc.assets import current_order, list_final_slides, list_ready_public_assets
from apc.common import (
    clamp_ig_graph_children,
    expected_child_count,
    preview,
    response_json,
    retry_at,
    unlock_fields,
    valid_record_id,
)
from apc.constants import (
    CHILD_CREATING,
    CHILD_IN_PROGRESS,
    CHILD_RETRY,
    ERROR_AP1C,
    IG_GRAPH_MAX_CHILDREN,
    MAKE_AP1C_ID,
    MAKE_AP1C_NAME,
    RETRY_MINUTES,
    STAGE_AP1C,
    STATUS_ASSETS_READY,
    STATUS_CHILDREN_PROCESSING,
    STATUS_CREATING_CHILDREN,
    STATUS_RETRY,
)
from apc.eligibility import ap1c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, graph_id, http_ok, load_instagram_settings
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field, field_str


AP1C_RATE_LIMIT_RETRY_MINUTES = 30


def _is_rate_limited(message: str) -> bool:
    text = str(message or "").casefold()
    return "too many actions" in text or "rate limit" in text or "request limit" in text


def _reset_parent(
    client: AirtableClient,
    output: dict[str, Any],
    message: str,
    *,
    retry_minutes: int = RETRY_MINUTES,
    park_for_quality: bool = False,
) -> None:
    # Deterministic or exhausted failures must not spin until Meta throttles us.
    # A paused row remains approved; only the AP1C stage is fenced.
    attempts = (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1
    park = park_for_quality or attempts >= 5
    retry_stamp = None if park else retry_at(retry_minutes)
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        output["id"],
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_RETRY if park else STATUS_ASSETS_READY,
            "Publish_Next_Retry_At": retry_stamp,
            "Publish_Retry_Eligible": not park,
            "IG_Carousel_Error_Stage": ERROR_AP1C,
            "IG_Carousel_Retry_Count": attempts,
            "IG_Carousel_Error_Message": (
                message + (" QA-IG-AP1C-RETRY-FENCED: inspect exact slide identities before rearming." if park else "")
            ),
            "IG_Carousel_Next_Retry_At": retry_stamp,
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

    output_id = field_str(output, "Output_ID") or field(output, "Output_ID")
    slides = list_final_slides(client, output_id)
    expected_before_clamp = expected_child_count(output, len(slides))
    # The C9 final-slides view can omit the first approved cover even though
    # its IG public asset is Ready. AP1C then repeatedly sees only 4/5 slides
    # (Output 3420). Recover from the authoritative public-ready slide set,
    # but only when it has the exact expected number and unique record IDs.
    if len(slides) != expected_before_clamp:
        ready_slides = list_ready_public_assets(client, output_id)
        ready_ids = [str(s.get("id") or "") for s in ready_slides]
        if len(ready_slides) == expected_before_clamp and len(set(ready_ids)) == len(ready_ids):
            slides = ready_slides
            result["recovered_from_public_ready_slides"] = True
        else:
            message = (
                f"AP1C slide-set mismatch: final view {len(slides)}, "
                f"public-ready {len(ready_slides)}, expected {expected_before_clamp}; "
                "not creating an incomplete carousel."
            )
            # Output 7856 / 7043: 8 linked public-ready slides vs 4 approved.
            # Two slide-number sets are not proof that their media/order match.
            # Never arbitrarily discard records or create Instagram children.
            doubled = len(slides) == 2 * expected_before_clamp and len(ready_slides) == len(slides)
            if doubled:
                message = "QA-IG-AP1C-DUPLICATE-SLIDE-SETS: " + message
            _reset_parent(
                client, output, message,
                retry_minutes=AP1C_RATE_LIMIT_RETRY_MINUTES,
                park_for_quality=doubled,
            )
            return {"processed": True, "needs_children": False if doubled else True,
                    "reason": "duplicate_slide_sets" if doubled else "incomplete_slide_set", **result}
    slides, capped = clamp_ig_graph_children(slides, IG_GRAPH_MAX_CHILDREN)
    if capped:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {"IG_Carousel_Child_Count": len(slides), "Image_Count": len(slides)},
            typecast=True,
        )
        output.setdefault("fields", {})
        output["fields"]["IG_Carousel_Child_Count"] = len(slides)
        output["fields"]["Image_Count"] = len(slides)
        result["children_capped"] = True
        result["expected_child_count"] = len(slides)
    settings = PipelineSettings(client)
    graph = InstagramCarouselClient(**load_instagram_settings(settings, output, client=client))
    retained_child_ids: list[str] = []
    created_now = 0
    for slide in slides:
        existing_id = field_str(slide, "IG_Child_Container_ID")
        existing_status = field_str(slide, "IG_Child_Container_Status").strip().casefold()
        # Preserve healthy/in-flight children. AP1C retries must create only
        # missing or terminal children; recreating already-good children caused
        # Meta "User is performing too many actions" throttling on NYC 1298.
        if existing_id and existing_status not in {"error", "expired"}:
            retained_child_ids.append(existing_id)
            continue

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
            retained_child_ids.append(child_id)
            created_now += 1
            continue
        graph_error = error_message(payload, status_code)
        message = f"AP1C child creation failed for slide {current_order(slide)}. HTTP {status_code}: {graph_error}"
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
        retry_minutes = AP1C_RATE_LIMIT_RETRY_MINUTES if _is_rate_limited(graph_error) else RETRY_MINUTES
        _reset_parent(client, output, message, retry_minutes=retry_minutes)
        return {
            "processed": True,
            "needs_children": True,
            "rate_limited": _is_rate_limited(graph_error),
            "retry_minutes": retry_minutes,
            "retained_count": len(set(retained_child_ids)),
            **result,
        }

    # Count the children preserved from prior attempts plus any created now.
    # Do not immediately reread Airtable: its final write can briefly lag.
    created_count = len(set(retained_child_ids))
    expected = min(expected_child_count(output, len(slides)), IG_GRAPH_MAX_CHILDREN)
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
            "IG_Carousel_Next_Retry_At": None,
            "IG_Carousel_Children_Ready_Count": 0,
            "IG_Carousel_Last_Completed_Stage": STAGE_AP1C,
        },
        typecast=True,
    )
    result.update({
        "processed": True,
        "needs_child_poll": True,
        "created_count": created_count,
        "created_now": created_now,
        "retained_count": created_count - created_now,
    })
    return result
