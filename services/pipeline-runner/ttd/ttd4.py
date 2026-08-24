"""TTD4 — TikTok manual completion form and submit (Make 5806518)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from carousel.timeutil import iso_utc, stamp_minutes
from render.fields import field_str
from ttd.common import append_note, preview, unlock_fields, valid_record_id
from ttd.constants import (
    MAKE_TTD4_ID,
    MAKE_TTD4_NAME,
    MANUAL_COMPLETED,
    MUSIC_COMPLETED,
    MUSIC_MANUAL,
    MUSIC_NOT_REQUIRED,
    OUTPUT_STATUS_PUBLISHED,
    PUBLISH_STATUS_PUBLISHED,
    STATUS_PUBLISHED,
)
from ttd.eligibility import ttd4_form_eligibility_reason
from ttd.package import form_html, page_html, submit_action_url


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    replace_transaction_id: str | None = None,
    replace_fingerprint: str | None = None,
    dry_run: bool = False,
    action: str | None = None,
    token: str | None = None,
    platform_post_url: str | None = None,
    music_completed: str | None = None,
    form_url: str | None = None,
) -> dict[str, Any]:
    result = preview(
        stage="ttd4",
        make_id=MAKE_TTD4_ID,
        make_name=MAKE_TTD4_NAME,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
    )
    record_id = str(output_record_id or "").strip()
    action_name = str(action or "form").strip().casefold()
    result["action"] = action_name
    if not valid_record_id(record_id):
        result["html"] = page_html(title="Cannot complete this output", body="The request is missing a record id.")
        result["http_status"] = 400
        return {"processed": False, "reason": "missing_output_record_id", **result}

    client = AirtableClient()
    output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    if test_run_id and field_str(output, "Test_Run_ID") != test_run_id:
        result["html"] = page_html(title="Cannot complete this output", body="The test-run address does not match.")
        result["http_status"] = 400
        return {"processed": False, "reason": "test_run_mismatch", **result}

    reason = ttd4_form_eligibility_reason(output, token=str(token or ""))
    result["eligibility_reason"] = reason
    if reason == "token_mismatch":
        result["html"] = page_html(title="Invalid or expired link", body="The TikTok completion token does not match this output.")
        result["http_status"] = 403
        return {"processed": False, "reason": reason, **result}
    if reason == "do_not_publish":
        result["html"] = page_html(title="Publishing is blocked", body="This output is marked Do Not Publish.")
        result["http_status"] = 409
        return {"processed": False, "reason": reason, **result}
    if reason == "already_published":
        extra = f"<p>{field_str(output, 'Platform_Post_URL')}</p>" if field_str(output, "Platform_Post_URL") else ""
        result["html"] = page_html(title="Already published", body="This output was already finalized.", extra=extra)
        result["http_status"] = 200
        return {"processed": False, "reason": reason, **result}

    if action_name == "form":
        if reason:
            result["html"] = page_html(
                title="Cannot complete this output",
                body="The output is not awaiting manual completion.",
            )
            result["http_status"] = 400
            return {"processed": False, "reason": reason, **result}
        action_url = submit_action_url(form_url or field_str(output, "TikTok_Manual_Completion_URL"))
        result["html"] = form_html(output, action_url=action_url)
        result["http_status"] = 200
        return {"processed": True, **result}

    url = str(platform_post_url or "").strip()
    if reason or not url or "tiktok.com" not in url.casefold():
        result["html"] = page_html(
            title="Cannot complete this output",
            body="The request is missing a final TikTok URL, the URL is not a TikTok post URL, or the output is not awaiting manual completion.",
            extra="<p>Please submit a URL containing <b>tiktok.com</b>.</p>",
        )
        result["http_status"] = 400
        return {"processed": False, "reason": reason or "invalid_tiktok_url", **result}

    if dry_run:
        result["html"] = page_html(title="TikTok publication recorded", body="Dry-run only; Airtable was not updated.")
        return {"processed": False, "dry_run": True, **result}

    music = str(music_completed or "").strip().casefold()
    now = iso_utc()
    if music == "yes":
        music_status = MUSIC_COMPLETED
        music_at = now
    elif music == "not_requested":
        music_status = MUSIC_NOT_REQUIRED
        music_at = None
    else:
        music_status = MUSIC_MANUAL
        music_at = None

    client.update_record(
        PLATFORM_OUTPUTS_TABLE,
        record_id,
        {
            **unlock_fields(),
            "Music_Status": music_status,
            "Output_Notes": append_note(output, f"TTD4 manual publication confirmed at {stamp_minutes()}. URL: {url}"),
            "Published_At": now,
            "Output_Status": OUTPUT_STATUS_PUBLISHED,
            "Publish_Status": PUBLISH_STATUS_PUBLISHED,
            "Platform_Post_URL": url,
            "Music_Completion_At": music_at,
            "Publish_Error_Stage": "",
            "TikTok_Draft_Status": STATUS_PUBLISHED,
            "Manual_Completion_At": now,
            "Manual_Published_URL": url,
            "Publish_Error_Message": "",
            "Publish_Next_Retry_At": None,
            "Publish_Retry_Eligible": False,
            "TikTok_Manual_Posted_At": now,
            "Manual_Completion_Status": MANUAL_COMPLETED,
            "Manual_Fallback_Required": False,
            "TikTok_Public_Confirmation_At": now,
        },
    )
    result["html"] = page_html(
        title="TikTok publication recorded",
        body=f"Output #{field_str(output, 'Output_ID') or record_id} is now marked Published in Airtable.",
        extra=f'<p><a href="{url}">Open the TikTok post</a></p>',
    )
    result["http_status"] = 200
    result["published"] = True
    return {"processed": True, **result}
