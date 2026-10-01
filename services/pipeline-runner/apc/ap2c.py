"""AP2C — poll Instagram carousel child containers (Make 5791231)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE
from apc.assets import child_finished, child_terminal, list_child_slides
from apc.common import expected_child_count, preview, response_json, retry_at, setting_int, unlock_fields, valid_record_id
from apc.constants import (
    CHILD_FINISHED,
    CHILD_RETRY,
    DEFAULT_MAX_POLL_ATTEMPTS,
    DEFAULT_POLL_DELAY_MINUTES,
    ERROR_AP2C,
    ERROR_AP2C_VERIFY,
    MAKE_AP2C_ID,
    MAKE_AP2C_NAME,
    RETRY_MINUTES,
    STAGE_AP2C,
    STATUS_ASSETS_READY,
    STATUS_CHILDREN_PROCESSING,
    STATUS_CHILDREN_READY,
)
from apc.eligibility import ap2c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, http_ok, load_instagram_settings, mapped_status
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field, field_str


def _pending_max_attempts(slides: list[dict[str, Any]]) -> int:
    pending = [slide for slide in slides if not child_finished(slide)]
    return max(
        (parse_int(field(slide, "IG_Child_Container_Attempt_Count"), 0) or 0)
        for slide in pending
    ) if pending else 0


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ap2c",
        make_id=MAKE_AP2C_ID,
        make_name=MAKE_AP2C_NAME,
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
    reason = ap2c_eligibility_reason(output)
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
            "Publish_Locked_By": STAGE_AP2C,
            "Publish_Started_At": now,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "IG_Carousel_Error_Message": "",
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    delay = setting_int(settings, "IG_CONTAINER_POLL_DELAY_MINUTES", DEFAULT_POLL_DELAY_MINUTES)
    max_attempts = setting_int(settings, "IG_CONTAINER_MAX_POLL_ATTEMPTS", DEFAULT_MAX_POLL_ATTEMPTS)
    graph = InstagramCarouselClient(**load_instagram_settings(settings, output, client=client))
    slides = list_child_slides(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    for slide in slides:
        try:
            status_code, payload = graph.container_status(field_str(slide, "IG_Child_Container_ID"))
        except Exception:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {"IG_Child_Container_Error": "AP2C runtime error while polling child containers.", "IG_Child_Container_Status": CHILD_RETRY},
                typecast=True,
            )
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record_id,
                {
                    **unlock_fields(),
                    "IG_Carousel_Status": STATUS_CHILDREN_PROCESSING,
                    "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                    "Publish_Retry_Eligible": True,
                    "IG_Carousel_Error_Stage": ERROR_AP2C,
                    "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                    "IG_Carousel_Error_Message": "AP2C runtime error while polling child containers.",
                    "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
                },
                typecast=True,
            )
            return {"processed": True, "needs_child_poll": True, **result}

        code = str(payload.get("status_code") or "").upper()
        ready = code in {"FINISHED", "PUBLISHED"}
        error = ""
        if http_ok(status_code) and code in {"ERROR", "EXPIRED"}:
            error = str(payload.get("status") or payload)
        elif not http_ok(status_code):
            error = error_message(payload, status_code)
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "IG_Carousel_Item_Ready": ready,
                "IG_Child_Container_Error": error,
                "IG_Child_Container_Status": mapped_status(status_code, payload, child=True),
                "IG_Child_Container_Attempt_Count": (parse_int(field(slide, "IG_Child_Container_Attempt_Count"), 0) or 0) + 1,
                "IG_Child_Container_Response_JSON": response_json(payload),
                "IG_Child_Container_Last_Checked_At": iso_utc(),
            },
            typecast=True,
        )

    stored = list_child_slides(client, field_str(output, "Output_ID") or field(output, "Output_ID"))
    finished = sum(1 for slide in stored if child_finished(slide))
    terminal = sum(1 for slide in stored if child_terminal(slide))
    # Finished children can accumulate more polls than a slower remaining child.
    # Timeout must follow the unfinished required children, not the max attempt
    # count of already-FINISHED siblings (NYC Output 1298).
    attempts = _pending_max_attempts(stored)
    expected = expected_child_count(output, len(stored))
    if len(stored) != expected:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_ASSETS_READY,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP2C_VERIFY,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": (
                    f"AP2C verified child-count mismatch. Stored linked children: {len(stored)}; expected: {expected}. "
                    "The output was returned to AP1C instead of remaining locked."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
                "IG_Carousel_Children_Ready_Count": 0,
            },
            typecast=True,
        )
        return {"processed": True, "needs_children": True, **result}

    if finished == expected and finished > 1:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_CHILDREN_READY,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": "",
                "IG_Carousel_Error_Message": "",
                "IG_Carousel_Next_Retry_At": None,
                "IG_Carousel_Children_Ready_Count": finished,
                "IG_Carousel_Last_Completed_Stage": STAGE_AP2C,
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_parent": True, "children_ready": True, "finished": finished})
        return result

    if terminal or attempts >= max_attempts:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_ASSETS_READY,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP2C,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": (
                    f"AP2C verified terminal child failure or poll timeout. Finished: {finished}; "
                    f"terminal: {terminal}; max attempts: {attempts}. AP1C will recreate children."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
                "IG_Carousel_Children_Ready_Count": finished,
            },
            typecast=True,
        )
        return {"processed": True, "needs_children": True, "finished": finished, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_CHILDREN_PROCESSING,
            "Publish_Next_Retry_At": retry_at(delay),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": "",
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Next_Retry_At": retry_at(delay),
            "IG_Carousel_Children_Ready_Count": finished,
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_child_poll": True, "still_processing": True, "finished": finished})
    return result
