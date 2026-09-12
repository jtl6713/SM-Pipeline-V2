"""AP4R — reconcile an ambiguous Instagram carousel publish (Make 5791396)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from apc.common import preview, reconcile_caption, response_json, retry_at, setting_int, unlock_fields, valid_record_id
from apc.constants import (
    DEFAULT_POLL_DELAY_MINUTES,
    DEFAULT_RECONCILE_MAX_ATTEMPTS,
    ERROR_AP4C,
    MAKE_AP4R_ID,
    MAKE_AP4R_NAME,
    PUBLISH_STATUS_FAILED,
    REPLACE_MANUAL,
    RETRY_MINUTES,
    STAGE_AP4R,
    STATUS_MANUAL_FALLBACK,
    STATUS_PARENT_READY,
    STATUS_PUBLISHING,
)
from apc.eligibility import ap4r_eligibility_reason
from apc.graph import InstagramCarouselClient, load_instagram_settings
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
        stage="ap4r",
        make_id=MAKE_AP4R_ID,
        make_name=MAKE_AP4R_NAME,
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
    reason = ap4r_eligibility_reason(
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
    attempt = (parse_int(field(output, "IG_Carousel_Reconcile_Attempt_Count"), 0) or 0) + 1
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_AP4R,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Reconcile_Attempt_Count": attempt,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    delay = setting_int(settings, "IG_CONTAINER_POLL_DELAY_MINUTES", DEFAULT_POLL_DELAY_MINUTES)
    max_attempts = setting_int(settings, "IG_PUBLISH_RECONCILE_MAX_ATTEMPTS", DEFAULT_RECONCILE_MAX_ATTEMPTS)
    expected = reconcile_caption(output)
    try:
        graph = InstagramCarouselClient(**load_instagram_settings(settings, output, client=client))
        status_code, payload = graph.list_recent_media()
    except Exception:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PUBLISHING,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP4C,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": "AP4R runtime error while listing recent media.",
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            },
            typecast=True,
        )
        return {"processed": True, "needs_reconcile": True, **result}

    rows = payload.get("data") if isinstance(payload.get("data"), list) else []
    matches = [
        row
        for row in rows
        if isinstance(row, dict)
        and str(row.get("media_type") or "").strip() == "CAROUSEL_ALBUM"
        and str(row.get("caption") or "").strip() == expected
        and str(row.get("id") or "").strip()
    ]
    if matches:
        media_id = str(matches[0]["id"]).strip()
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
                "IG_Carousel_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_finalize": True, "media_id": media_id})
        return result

    if attempt < max_attempts:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PUBLISHING,
                "Publish_Next_Retry_At": retry_at(delay),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP4C,
                "IG_Carousel_Error_Message": (
                    f"AP4R did not yet find a matching recent carousel. Reconciliation attempt {attempt} of {max_attempts}."
                ),
                "IG_Carousel_Next_Retry_At": retry_at(delay),
                "IG_Carousel_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result.update({"processed": True, "needs_reconcile": True, "still_processing": True})
        return result

    message = (
        f"AP4R found no matching recent carousel after {attempt} attempts. "
        "The publish call is now eligible for a controlled retry."
    )
    if field_str(output, "Replace_Transaction_ID"):
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "Replace_Error": "Item6 replacement reconciliation exhausted without a unique carousel match. Automatic republish is blocked; manual cleanup/reconciliation is required.",
                "Replace_State": REPLACE_MANUAL,
                "Publish_Status": PUBLISH_STATUS_FAILED,
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_MANUAL_FALLBACK,
                "Replace_Updated_At": iso_utc(),
                "Publish_Next_Retry_At": None,
                "Replace_Cleanup_State": REPLACE_MANUAL,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": ERROR_AP4C,
                "Manual_Fallback_Required": True,
                "IG_Carousel_Error_Message": message,
                "IG_Carousel_Next_Retry_At": None,
                "IG_Carousel_Reconcile_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
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
            "IG_Carousel_Error_Message": message,
            "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            "IG_Carousel_Reconcile_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_publish": True})
    return result
