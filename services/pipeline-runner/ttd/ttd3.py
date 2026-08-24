"""TTD3 — send the TikTok draft handoff email (Make 5806570)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc, stamp_minutes
from integrations.gmail import GmailClient
from item4.settings import PipelineSettings
from render.fields import field_str
from ttd.common import append_note, preview, response_json, retry_at, unlock_fields, valid_record_id
from ttd.constants import (
    DEFAULT_EMAIL_TO,
    EMAIL_RETRY_MINUTES,
    MAKE_TTD3_ID,
    MAKE_TTD3_NAME,
    MANUAL_REQUIRED,
    PUBLISH_STATUS_FAILED,
    PUBLISH_STATUS_READY,
    STAGE_TTD3,
    STATUS_MANUAL_RECEIVED,
    STATUS_RETRY,
)
from ttd.eligibility import ttd3_eligibility_reason
from ttd.package import handoff_email_html, handoff_email_subject


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    result = preview(
        stage="ttd3",
        make_id=MAKE_TTD3_ID,
        make_name=MAKE_TTD3_NAME,
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

    reason = ttd3_eligibility_reason(output)
    result["eligibility_reason"] = reason
    if reason:
        return {"processed": False, "reason": reason, **result}

    settings = PipelineSettings(client)
    to_addr = settings.get("TIKTOK_DRAFT_EMAIL_TO") or DEFAULT_EMAIL_TO
    result["email_to"] = to_addr
    if dry_run:
        return {"processed": False, "dry_run": True, **result}

    now = iso_utc()
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            "Publish_Locked_At": now,
            "Publish_Locked_By": STAGE_TTD3,
            "Publish_Started_At": now,
            "Publish_Error_Stage": "",
            "Publish_Error_Message": "",
        },
    )

    subject = handoff_email_subject(output)
    html_body = handoff_email_html(output)
    result["subject"] = subject
    try:
        send = GmailClient().send_html(to=to_addr, subject=subject, html_body=html_body)
        result["gmail_id"] = send.get("id")
    except Exception as exc:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            record_id,
            {
                **unlock_fields(),
                "Output_Notes": append_note(output, f"TTD3_EMAIL runtime failure at {stamp_minutes()}. {exc}"),
                "Publish_Status": PUBLISH_STATUS_FAILED,
                "Publish_Error_Stage": "TTD3_EMAIL",
                "TikTok_Draft_Status": STATUS_RETRY,
                "Publish_Error_Message": f"TTD3_EMAIL runtime failure. {exc}",
                "Publish_Next_Retry_At": retry_at(EMAIL_RETRY_MINUTES),
                "Publish_Retry_Eligible": True,
                "TikTok_Draft_Response_JSON": response_json(
                    {"runtime_error_type": type(exc).__name__, "runtime_error_message": str(exc)}
                ),
            },
        )
        return {"processed": True, "retry": True, **result}

    status = (
        STATUS_MANUAL_RECEIVED
        if field_str(output, "TikTok_Draft_Status") == STATUS_MANUAL_RECEIVED
        else field_str(output, "TikTok_Draft_Status")
    )
    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Output_Notes": append_note(output, f"TTD3 handoff email sent at {stamp_minutes()}."),
            "Publish_Status": PUBLISH_STATUS_READY,
            "Publish_Error_Stage": "",
            "TikTok_Draft_Status": status,
            "Operational_Email_Key": f"TTD3:{field_str(output, 'TikTok_Draft_Publish_ID')}",
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "Manual_Completion_Status": MANUAL_REQUIRED,
            "Operational_Email_Sent_At": now,
            "TikTok_Draft_Email_Sent_At": now,
        },
    )
    result["email_sent"] = True
    return {"processed": True, **result}
