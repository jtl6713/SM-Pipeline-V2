"""I2 processor — idea review email (Make 5516968)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import SOURCE_CANDIDATES_TABLE
from config import load_settings
from i2.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from i2.email_builder import review_email_html, review_subject
from idea.constants import DEFAULT_I2_EMAIL_TO, I2_REVIEW_VIEW
from integrations.gmail import GmailClient
from render.fields import field_str


def review_url() -> str:
    settings = load_settings()
    base = str(settings.get("public_base_url") or "").rstrip("/")
    token = str(settings.get("i3_webhook_token") or "").strip()
    if base and token:
        return f"{base}/hooks/i3/{token}"
    hook = str(settings.get("i3_webhook_url") or "").strip()
    if "hook.us2.make.com" in hook:
        hook = ""
    return hook


def process_request(
    *,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    candidates = client.list_records(SOURCE_CANDIDATES_TABLE, view=I2_REVIEW_VIEW, max_records=50)
    if test_run_id:
        candidates = [row for row in candidates if field_str(row, "Test_Run_ID") == test_run_id]
    preview["candidate_ids"] = [row["id"] for row in candidates]
    preview["subject"] = review_subject(candidates) if candidates else None
    if not candidates:
        return {"processed": False, "reason": "no_generated_candidates", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    hook = review_url()
    if not hook:
        raise RuntimeError("I2 needs I3_WEBHOOK_TOKEN or I3_WEBHOOK_URL")
    settings = load_settings()
    to_addr = str(settings.get("i2_email_to") or DEFAULT_I2_EMAIL_TO).strip()
    send = GmailClient().send_html(
        to=to_addr,
        subject=review_subject(candidates),
        html_body=review_email_html(candidates, review_url=hook),
    )
    for row in candidates:
        client.update_record(SOURCE_CANDIDATES_TABLE, row["id"], {"Candidate_Status": "Sent for Review"})
    return {
        "processed": True,
        "gmail_message_id": send.get("id"),
        "email_to": to_addr,
        "review_url_host": hook.split("?")[0],
        "sent_count": len(candidates),
        **preview,
    }
