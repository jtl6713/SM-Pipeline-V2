"""TTD2 — poll TikTok draft processing (Make 5806597)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from asset.helpers import parse_int
from carousel.timeutil import iso_utc, stamp_minutes
from item4.settings import PipelineSettings
from render.fields import field, field_str, json_text
from ttd.client import (
    TikTokDraftClient,
    TikTokDraftError,
    draft_status_from,
    fail_reason_from,
    load_tiktok_settings,
    public_post_ids_from,
)
from ttd.common import append_note, preview, response_json, retry_at, unlock_fields, valid_record_id
from ttd.constants import (
    COMPLETE_STATUS,
    DEFAULT_MAX_POLL_ATTEMPTS,
    DEFAULT_POLL_DELAY_MINUTES,
    FAILED_STATUS,
    INBOX_STATUS,
    MAKE_TTD2_ID,
    MAKE_TTD2_NAME,
    MANUAL_REQUIRED,
    MUSIC_MANUAL,
    MUSIC_MODE_MANUAL,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_PUBLISHING,
    PUBLISH_STATUS_READY,
    STAGE_TTD2,
    STATUS_DELIVERED,
    STATUS_FAILED,
    STATUS_MANUAL_RECEIVED,
    STATUS_PROCESSING,
    STATUS_RETRY,
    VIDEO_RETRY_MINUTES,
)
from ttd.eligibility import ttd2_eligibility_reason
from ttd.package import completion_token_material, completion_url, hash_completion_token


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ttd2",
        make_id=MAKE_TTD2_ID,
        make_name=MAKE_TTD2_NAME,
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

    reason = ttd2_eligibility_reason(
        output,
        replace_transaction_id=replace_transaction_id,
        replace_fingerprint=replace_fingerprint,
    )
    publish_id = field_str(output, "TikTok_Draft_Publish_ID")
    result["eligibility_reason"] = reason
    result["publish_id"] = publish_id
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
            "Publish_Locked_By": STAGE_TTD2,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "TikTok_Draft_Status": STATUS_PROCESSING,
            "Publish_Error_Message": "",
            "Publish_Retry_Eligible": False,
            "TikTok_Draft_Last_Checked_At": now,
        },
    )

    settings = PipelineSettings(client)
    delay = parse_int(settings.get("TIKTOK_DRAFT_POLL_DELAY_MINUTES"), DEFAULT_POLL_DELAY_MINUTES) or DEFAULT_POLL_DELAY_MINUTES
    max_attempts = parse_int(settings.get("TIKTOK_DRAFT_MAX_POLL_ATTEMPTS"), DEFAULT_MAX_POLL_ATTEMPTS) or DEFAULT_MAX_POLL_ATTEMPTS
    attempts = (parse_int(field(output, "TikTok_Draft_Poll_Attempt_Count"), 0) or 0) + 1
    timed_out = attempts >= max_attempts
    result["poll_attempt"] = attempts

    try:
        worker = load_tiktok_settings(settings, output, client=client)
        status_code, body = TikTokDraftClient(base_url=worker["url"], secret=worker["secret"]).draft_status(publish_id)
    except TikTokDraftError as exc:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Output_Notes": append_note(output, f"TTD2_STATUS runtime failure at {stamp_minutes()}. {exc}"),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Error_Stage": "TTD2_STATUS",
                "TikTok_Draft_Status": STATUS_RETRY,
                "Publish_Error_Message": f"TTD2_STATUS runtime failure. {exc}",
                "Publish_Next_Retry_At": retry_at(VIDEO_RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "TikTok_Draft_Response_JSON": response_json({"runtime_error_message": str(exc)}),
            },
        )
        return {"processed": True, "retry": True, **result}

    status = draft_status_from(body).upper()
    result["http_status"] = status_code
    result["tiktok_status"] = status
    token = hash_completion_token(completion_token_material(record_id, publish_id))
    form_url = completion_url(settings.get("TTD4_WEBHOOK_URL"), record_id, token)
    public_ids = public_post_ids_from(body)

    if status == INBOX_STATUS:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Music_Status": MUSIC_MANUAL,
                "Output_Notes": append_note(
                    output,
                    f"TTD2 confirmed SEND_TO_USER_INBOX at {stamp_minutes()}. Manual TikTok editing and posting required.",
                ),
                "Publish_Status": PUBLISH_STATUS_READY,
                "Music_Handling_Mode": MUSIC_MODE_MANUAL,
                "Publish_Error_Stage": "",
                "TikTok_Draft_Status": STATUS_DELIVERED,
                "Manual_Completion_At": None,
                "Manual_Published_URL": "",
                "Operational_Email_Key": "",
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Manual_Completion_Status": MANUAL_REQUIRED,
                "Operational_Email_Sent_At": None,
                "TikTok_Draft_Delivered_At": now,
                "TikTok_Draft_Email_Sent_At": None,
                "TikTok_Draft_Response_JSON": response_json(body),
                "TikTok_Draft_Last_Checked_At": now,
                "TikTok_Manual_Completion_URL": form_url,
                "Platform_Publish_Response_JSON": response_json(body),
                "TikTok_Manual_Completion_Token": token,
                "TikTok_Draft_Poll_Attempt_Count": attempts,
                "TikTok_Draft_Public_Post_IDs_JSON": json_text(public_ids) if public_ids else "",
            },
        )
        result["needs_email"] = True
        result["tiktok_draft_status"] = STATUS_DELIVERED
        return {"processed": True, **result}

    if status == COMPLETE_STATUS:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Status": PUBLISH_STATUS_READY,
                "Platform_Post_ID": public_ids[0] if public_ids else "",
                "Publish_Error_Stage": "",
                "TikTok_Draft_Status": STATUS_MANUAL_RECEIVED,
                "Publish_Error_Message": "",
                "Publish_Next_Retry_At": None,
                "Publish_Retry_Eligible": False,
                "Manual_Completion_Status": MANUAL_REQUIRED,
                "TikTok_Draft_Delivered_At": field_str(output, "TikTok_Draft_Delivered_At") or now,
                "TikTok_Draft_Response_JSON": response_json(body),
                "TikTok_Draft_Last_Checked_At": now,
                "TikTok_Manual_Completion_URL": form_url,
                "TikTok_Manual_Completion_Token": token,
                "TikTok_Draft_Poll_Attempt_Count": attempts,
                "TikTok_Draft_Public_Post_IDs_JSON": json_text(public_ids) if public_ids else "",
            },
        )
        result["needs_email"] = True
        result["tiktok_draft_status"] = STATUS_MANUAL_RECEIVED
        return {"processed": True, **result}

    if status == FAILED_STATUS:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Error_Stage": "TTD2_FAILED",
                "TikTok_Draft_Status": STATUS_FAILED if timed_out else STATUS_RETRY,
                "Publish_Error_Message": f"TikTok draft processing failed: {fail_reason_from(body)}",
                "Publish_Next_Retry_At": None if timed_out else retry_at(delay),
                "Publish_Retry_Eligible": not timed_out,
                "Manual_Fallback_Required": timed_out,
                "TikTok_Draft_Response_JSON": response_json(body),
                "TikTok_Draft_Last_Checked_At": now,
                "TikTok_Draft_Poll_Attempt_Count": attempts,
            },
        )
        result["terminal"] = timed_out
        return {"processed": True, "retry": not timed_out, **result}

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Publish_Status": PUBLISH_STATUS_FAILED if timed_out else PUBLISH_STATUS_PUBLISHING,
            "Publish_Error_Stage": "TTD2_TIMEOUT" if timed_out else "",
            "TikTok_Draft_Status": STATUS_FAILED if timed_out else STATUS_PROCESSING,
            "Publish_Error_Message": (
                f"TikTok draft processing exceeded the maximum poll attempts. Last status: {status or draft_status_from(body)}"
                if timed_out
                else ""
            ),
            "Publish_Next_Retry_At": None if timed_out else retry_at(delay),
            "Publish_Retry_Eligible": not timed_out,
            "Manual_Fallback_Required": timed_out,
            "TikTok_Draft_Response_JSON": response_json(body),
            "TikTok_Draft_Last_Checked_At": now,
            "TikTok_Draft_Poll_Attempt_Count": attempts,
        },
    )
    result["still_processing"] = not timed_out
    result["terminal"] = timed_out
    return {"processed": True, **result}
