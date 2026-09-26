"""C3 processor — one parent carousel review email (Make 5587853)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE
from c3.constants import C3_EMAIL_ENABLED, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, SLIDES_TABLE_URL
from c3.email_builder import review_email_html, review_subject
from carousel.constants import DEFAULT_C3_EMAIL_TO, SETTING_C3B_REVIEW_URL
from carousel.mapping import c3_include_slide
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_ms, stamp_minutes
from config import load_settings
from integrations.gmail import GmailClient
from item4.settings import pipeline_settings
from render.fields import field_str


def _review_url() -> str:
    settings = load_settings()
    if str(settings.get("stage_backend_c3b") or "python") != "disabled":
        base = str(settings.get("public_base_url") or "").rstrip("/")
        token = str(settings.get("c3b_webhook_token") or "").strip()
        if base and token:
            return f"{base}/hooks/c3b/{token}"
    return pipeline_settings().get(SETTING_C3B_REVIEW_URL)


def process_request(
    *,
    content_item_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "content_item_record_id": content_item_record_id,
        "test_run_id": test_run_id,
    }
    if not content_item_record_id:
        return {"processed": False, "reason": "missing_content_record_id", **preview}

    client = AirtableClient()
    parent = load_parent(client, content_item_record_id, test_run_id=test_run_id)
    if not parent:
        return {"processed": False, "reason": "parent_not_found_or_test_mismatch", **preview}

    slides = [slide for slide in load_linked_slides(client, parent) if c3_include_slide(slide)]
    preview["review_slide_ids"] = [slide["id"] for slide in slides]
    preview["subject"] = review_subject(parent, slides) if slides else None
    if not slides:
        return {"processed": False, "reason": "no_generated_slides", **preview}
    if field_str(parent, "Test_Run_ID"):
        return {"processed": False, "reason": "test_mode_email_suppressed", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if not C3_EMAIL_ENABLED:
        return {"processed": False, "reason": "email_disabled", **preview}

    review_url = _review_url()
    if not review_url:
        raise RuntimeError("C3 needs Carousel_Review_Webhook_URL or a Python C3B hook token")

    settings = load_settings()
    to_addr = str(settings.get("c3_email_to") or DEFAULT_C3_EMAIL_TO).strip()
    html_body = review_email_html(parent, slides, review_url=review_url, slides_table_url=SLIDES_TABLE_URL)
    send = GmailClient().send_html(to=to_addr, subject=review_subject(parent, slides), html_body=html_body)
    sent_at = iso_ms()
    for slide in slides:
        client.update_record(CAROUSEL_SLIDES_TABLE, slide["id"], {"C3 Review Email Sent At": sent_at})
    client.update_record(
        CONTENT_ITEMS_TABLE,
        parent["id"],
        {
            "Carousel_Review_Email_Sent_At": sent_at,
            "Carousel_Review_Status": "Review Sent",
            "Carousel_Review_Notes": (
                f"C3 v36.1 sent one parent-specific review email for CI-{field_str(parent, 'Content_ID')}, "
                f"{field_str(slides[0], 'Platform')}, {len(slides)} slides at {stamp_minutes()}. "
                "The Array Aggregator is scoped to the iterator module so all linked slides are emitted as one bundle."
            ),
        },
    )
    return {
        "processed": True,
        "gmail_message_id": send.get("id"),
        "email_to": to_addr,
        "review_url": review_url,
        **preview,
    }
