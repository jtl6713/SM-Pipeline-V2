"""AP4C — publish Instagram carousel parent (Make 5791356)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from apc.common import preview, response_json, retry_at, unlock_fields, valid_record_id
from apc.constants import (
    ERROR_AP4C,
    MAKE_AP4C_ID,
    MAKE_AP4C_NAME,
    PUBLISH_STATUS_FAILED,
    REPLACE_MANUAL,
    RETRY_MINUTES,
    STAGE_AP4C,
    STATUS_MANUAL_FALLBACK,
    STATUS_PARENT_READY,
    STATUS_PUBLISHING,
)
from apc.eligibility import ap4c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, graph_id, http_ok, load_instagram_settings
from asset.helpers import parse_int
from carousel.timeutil import iso_utc
from item4.settings import PipelineSettings
from render.fields import field, field_str


def _replace_fail(output: dict[str, Any], message: str, payload: Any) -> dict[str, Any]:
    return {
        **unlock_fields(),
        "Replace_Error": "Item6 replacement stopped after Instagram carousel media_publish failure. Automatic parent republish is blocked until the prior result is reconciled or cleaned up.",
        "Replace_State": REPLACE_MANUAL,
        "Publish_Status": PUBLISH_STATUS_FAILED,
        "IG_Carousel_Status": STATUS_MANUAL_FALLBACK,
        "Replace_Updated_At": iso_utc(),
        "Publish_Next_Retry_At": None,
        "Replace_Cleanup_State": REPLACE_MANUAL,
        "Publish_Retry_Eligible": False,
        "IG_Carousel_Error_Stage": ERROR_AP4C,
        "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
        "Manual_Fallback_Required": True,
        "IG_Carousel_Error_Message": message,
        "IG_Carousel_Next_Retry_At": None,
        "IG_Carousel_Publish_Response_JSON": response_json(payload),
    }


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ap4c",
        make_id=MAKE_AP4C_ID,
        make_name=MAKE_AP4C_NAME,
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
    reason = ap4c_eligibility_reason(
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
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_AP4C,
            "IG_Carousel_Status": STATUS_PUBLISHING,
            "Publish_Started_At": now,
            "Publish_Attempt_Count": (parse_int(field(output, "Publish_Attempt_Count"), 0) or 0) + 1,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Error_Stage": "",
            "Last_Publish_Attempt_At": now,
            "IG_Carousel_Error_Message": "",
            "IG_Carousel_Publish_Attempt_Count": (parse_int(field(output, "IG_Carousel_Publish_Attempt_Count"), 0) or 0) + 1,
        },
        typecast=True,
    )

    replace = bool(field_str(output, "Replace_Transaction_ID"))
    try:
        graph = InstagramCarouselClient(**load_instagram_settings(PipelineSettings(client)))
        status_code, payload = graph.publish(field_str(output, "IG_Carousel_Parent_Container_ID"))
    except Exception:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Started_At": now,
                "IG_Carousel_Status": STATUS_PUBLISHING,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP4C,
                "IG_Carousel_Error_Message": (
                    "AP4C transport/runtime error after media_publish was attempted. Outcome is unknown; "
                    "AP4R must reconcile recent Instagram media before any retry."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
                "IG_Carousel_Published_Media_ID": "",
                "IG_Carousel_Reconcile_Attempt_Count": 0,
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_reconcile": True})
        return result

    media_id = graph_id(payload)
    if http_ok(status_code) and media_id:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "Platform_Post_ID": media_id,
                "Platform_Media_ID": media_id,
                **unlock_fields(),
                "Publish_Started_At": now,
                "IG_Carousel_Status": STATUS_PUBLISHING,
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": "",
                "IG_Carousel_Published_At": iso_utc(),
                "IG_Carousel_Error_Message": "",
                "IG_Carousel_Next_Retry_At": None,
                "IG_Carousel_Published_Media_ID": media_id,
                "Platform_Publish_Response_JSON": response_json(payload),
                "IG_Carousel_Last_Completed_Stage": STAGE_AP4C,
                "IG_Carousel_Publish_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_finalize": True, "media_id": media_id})
        return result

    message = f"AP4C media_publish failed. HTTP {status_code}: {error_message(payload, status_code)}"
    if replace:
        client.update_record(PLATFORM_OUTPUTS_TABLE, record_id, _replace_fail(output, message, payload), typecast=True)
        result.update({"processed": True, "manual_fallback": True})
        return result

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "IG_Carousel_Status": STATUS_PARENT_READY,
            "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": ERROR_AP4C,
            "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
            "IG_Carousel_Error_Message": message,
            "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            "IG_Carousel_Publish_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_publish": True})
    return result
