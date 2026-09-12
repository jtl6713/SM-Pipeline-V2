"""AP3P — poll Instagram carousel parent container (Make 5791336)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from apc.common import ci, preview, response_json, retry_at, setting_int, unlock_fields, valid_record_id
from apc.constants import (
    DEFAULT_MAX_POLL_ATTEMPTS,
    DEFAULT_POLL_DELAY_MINUTES,
    ERROR_AP3P,
    MAKE_AP3P_ID,
    MAKE_AP3P_NAME,
    PARENT_FINISHED,
    PARENT_NOT_CREATED,
    RETRY_MINUTES,
    STAGE_AP3P,
    STATUS_CHILDREN_READY,
    STATUS_PARENT_PROCESSING,
    STATUS_PARENT_READY,
)
from apc.eligibility import ap3p_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, http_ok, load_instagram_settings, mapped_status
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
        stage="ap3p",
        make_id=MAKE_AP3P_ID,
        make_name=MAKE_AP3P_NAME,
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
    reason = ap3p_eligibility_reason(output)
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
            "Publish_Locked_By": STAGE_AP3P,
            "Publish_Started_At": now,
            "Publish_Retry_Eligible": False,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    delay = setting_int(settings, "IG_CONTAINER_POLL_DELAY_MINUTES", DEFAULT_POLL_DELAY_MINUTES)
    max_attempts = setting_int(settings, "IG_CONTAINER_MAX_POLL_ATTEMPTS", DEFAULT_MAX_POLL_ATTEMPTS)
    attempt = (parse_int(field(output, "IG_Carousel_Parent_Poll_Attempt_Count"), 0) or 0) + 1
    try:
        graph = InstagramCarouselClient(**load_instagram_settings(settings, output, client=client))
        status_code, payload = graph.container_status(field_str(output, "IG_Carousel_Parent_Container_ID"))
    except Exception:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PARENT_PROCESSING,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP3P,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": "AP3P runtime error while polling parent container.",
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            },
            typecast=True,
        )
        return {"processed": True, "needs_parent_poll": True, **result}

    parent_status = mapped_status(status_code, payload)
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "IG_Carousel_Parent_Status": parent_status,
            "IG_Carousel_Parent_Response_JSON": response_json(payload),
            "IG_Carousel_Parent_Last_Checked_At": iso_utc(),
            "IG_Carousel_Parent_Poll_Attempt_Count": attempt,
        },
        typecast=True,
    )

    if ci(parent_status) == ci(PARENT_FINISHED):
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PARENT_READY,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": "",
                "IG_Carousel_Error_Message": "",
                "IG_Carousel_Next_Retry_At": None,
                "IG_Carousel_Parent_Status": PARENT_FINISHED,
                "IG_Carousel_Last_Completed_Stage": STAGE_AP3P,
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_publish": True, "parent_ready": True})
        return result

    if ci(parent_status) in {ci("ERROR"), ci("EXPIRED")} or attempt >= max_attempts:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_CHILDREN_READY,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP3P,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": (
                    f"AP3P parent container terminal state or poll timeout. Status: {parent_status}; "
                    f"attempts: {attempt}. AP3C will recreate the parent."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
                "IG_Carousel_Parent_Status": PARENT_NOT_CREATED,
                "IG_Carousel_Parent_Created_At": None,
                "IG_Carousel_Parent_Container_ID": "",
                "IG_Carousel_Parent_Last_Checked_At": None,
                "IG_Carousel_Parent_Poll_Attempt_Count": 0,
            },
            typecast=True,
        )
        return {"processed": True, "needs_parent": True, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_PARENT_PROCESSING,
            "Publish_Next_Retry_At": retry_at(delay),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": "" if http_ok(status_code) else ERROR_AP3P,
            "IG_Carousel_Error_Message": "" if http_ok(status_code) else error_message(payload, status_code),
            "IG_Carousel_Next_Retry_At": retry_at(delay),
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_parent_poll": True, "still_processing": True})
    return result
