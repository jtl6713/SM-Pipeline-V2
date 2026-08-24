"""AP5C — finalize Instagram carousel permalink (Make 5791424)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from apc.common import append_note, preview, response_json, retry_at, setting_int, unlock_fields, valid_record_id
from apc.constants import (
    DEFAULT_POLL_DELAY_MINUTES,
    ERROR_AP5C,
    MAKE_AP5C_ID,
    MAKE_AP5C_NAME,
    OUTPUT_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHED,
    RETRY_MINUTES,
    STAGE_AP5C,
    STATUS_PUBLISHED,
    STATUS_PUBLISHING,
)
from apc.eligibility import ap5c_eligibility_reason
from apc.graph import InstagramCarouselClient, error_message, http_ok, load_instagram_settings
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
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
        stage="ap5c",
        make_id=MAKE_AP5C_ID,
        make_name=MAKE_AP5C_NAME,
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
    reason = ap5c_eligibility_reason(
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
            "Publish_Locked_By": STAGE_AP5C,
            "Publish_Retry_Eligible": False,
            "IG_Carousel_Finalize_Attempt_Count": (parse_int(field(output, "IG_Carousel_Finalize_Attempt_Count"), 0) or 0) + 1,
        },
        typecast=True,
    )

    settings = PipelineSettings(client)
    delay = setting_int(settings, "IG_CONTAINER_POLL_DELAY_MINUTES", DEFAULT_POLL_DELAY_MINUTES)
    try:
        graph = InstagramCarouselClient(**load_instagram_settings(settings))
        status_code, payload = graph.media_meta(field_str(output, "IG_Carousel_Published_Media_ID"))
    except Exception:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PUBLISHING,
                "Publish_Next_Retry_At": retry_at(RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "IG_Carousel_Error_Stage": ERROR_AP5C,
                "IG_Carousel_Retry_Count": (parse_int(field(output, "IG_Carousel_Retry_Count"), 0) or 0) + 1,
                "IG_Carousel_Error_Message": "AP5C runtime error while reading published media.",
                "IG_Carousel_Next_Retry_At": retry_at(RETRY_MINUTES),
            },
            typecast=True,
        )
        return {"processed": True, "needs_finalize": True, **result}

    permalink = str(payload.get("permalink") or "").strip()
    media_id = str(payload.get("id") or field_str(output, "IG_Carousel_Published_Media_ID")).strip()
    if http_ok(status_code) and media_id and permalink:
        published_at = str(payload.get("timestamp") or iso_utc())
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                "Output_Notes": append_note(output, f"AP5C finalized Instagram carousel at {stamp_minutes()}. Permalink: {permalink}"),
                "Published_At": published_at,
                "Output_Status": OUTPUT_STATUS_PUBLISHED,
                "Publish_Status": PUBLISH_STATUS_PUBLISHED,
                "Platform_Post_ID": media_id,
                "Platform_Media_ID": media_id,
                "Platform_Post_URL": permalink,
                **unlock_fields(),
                "IG_Carousel_Status": STATUS_PUBLISHED,
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "IG_Carousel_Error_Stage": "",
                "IG_Carousel_Published_At": published_at,
                "Manual_Fallback_Required": False,
                "IG_Carousel_Error_Message": "",
                "IG_Carousel_Next_Retry_At": None,
                "Platform_Publish_Response_JSON": response_json(payload),
                "IG_Carousel_Last_Completed_Stage": STAGE_AP5C,
                "IG_Carousel_Finalize_Response_JSON": response_json(payload),
            },
            typecast=True,
        )
        result.update({"processed": True, "published": True, "permalink": permalink, "media_id": media_id})
        return result

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Started_At": now,
            "IG_Carousel_Status": STATUS_PUBLISHING,
            "Publish_Next_Retry_At": retry_at(delay),
            "Publish_Retry_Eligible": True,
            "IG_Carousel_Error_Stage": ERROR_AP5C,
            "IG_Carousel_Error_Message": (
                f"AP5C media read/permalink lookup is not ready. HTTP {status_code}: {error_message(payload, status_code)}"
            ),
            "IG_Carousel_Next_Retry_At": retry_at(delay),
            "IG_Carousel_Finalize_Response_JSON": response_json(payload),
        },
        typecast=True,
    )
    result.update({"processed": True, "needs_finalize": True, "still_processing": True})
    return result
