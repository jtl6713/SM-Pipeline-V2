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
from render.fields import field, field_str, linked_ids


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


def is_studio_managed_candidate(record: dict[str, Any]) -> bool:
    """Studio-created ideas are promoted in Studio, not via the I2 review email."""
    for name in ("Production Requests", "Production_Request"):
        if linked_ids(field(record, name)):
            return True
    notes = " ".join(
        [
            field_str(record, "Production_Config_Notes"),
            field_str(record, "Idea_Summary"),
        ]
    )
    return "origin=ez-" in notes or "origin=autonomous" in notes


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
    reviewable = [row for row in candidates if not is_studio_managed_candidate(row)]
    preview["loaded_count"] = len(candidates)
    preview["skipped_studio_count"] = len(candidates) - len(reviewable)
    preview["candidate_ids"] = [row["id"] for row in reviewable]
    preview["subject"] = review_subject(reviewable) if reviewable else None
    if not candidates:
        return {"processed": False, "reason": "no_generated_candidates", **preview}
    if not reviewable:
        return {"processed": False, "reason": "studio_managed_only", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    settings = load_settings()
    if not settings.get("i2_email_enabled"):
        return {"processed": False, "reason": "email_disabled", **preview}

    hook = review_url()
    if not hook:
        raise RuntimeError("I2 needs I3_WEBHOOK_TOKEN or I3_WEBHOOK_URL")
    to_addr = str(settings.get("i2_email_to") or DEFAULT_I2_EMAIL_TO).strip()
    send = GmailClient().send_html(
        to=to_addr,
        subject=review_subject(reviewable),
        html_body=review_email_html(reviewable, review_url=hook),
    )
    for row in reviewable:
        client.update_record(SOURCE_CANDIDATES_TABLE, row["id"], {"Candidate_Status": "Sent for Review"})
    return {
        "processed": True,
        "gmail_message_id": send.get("id"),
        "email_to": to_addr,
        "review_url_host": hook.split("?")[0],
        "sent_count": len(reviewable),
        **preview,
    }
