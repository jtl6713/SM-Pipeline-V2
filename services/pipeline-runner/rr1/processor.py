"""RR1 processor — batched review email (Make 5576363)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from config import load_settings
from integrations.gmail import GmailClient
from render.fields import field_str
from rr1.constants import (
    DEFAULT_REVIEW_EMAIL_TO,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    MAX_RECORDS,
    OUTPUT_STATUS_READY,
    REVIEW_STATUS_SENT,
)
from rr1.email_builder import build_review_card, build_review_email_html, review_email_subject
from rr1.formulas import rr1_exact_output_formula, rr1_production_formula


def _decision_hook_url(settings: dict[str, Any]) -> str:
    configured = str(settings.get("rr1_decision_webhook_url") or "").strip()
    if "hook.us2.make.com" in configured:
        configured = ""
    base = str(settings.get("public_base_url") or "").rstrip("/")
    token = str(settings.get("rr2_webhook_token") or "").strip()
    python_hook = f"{base}/hooks/rr2/{token}" if base and token else ""
    return configured or python_hook


def _settings() -> dict[str, Any]:
    settings = load_settings()
    return {
        "review_email_to": (
            str(settings.get("rr1_review_email_to") or DEFAULT_REVIEW_EMAIL_TO).strip()
        ),
        "decision_webhook_url": _decision_hook_url(settings),
    }


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        formula = rr1_exact_output_formula(output_record_id, test_run_id or "")
        max_records = 1
    else:
        formula = rr1_production_formula()
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=formula,
        max_records=max_records,
    )


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    cfg = _settings()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=max_runs,
    )
    if not outputs:
        return {
            "processed": False,
            "reason": "no_review_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    cards = [
        build_review_card(output, decision_webhook_url=cfg["decision_webhook_url"])
        for output in outputs
    ]
    preview = {
        "processed": False,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_count": len(outputs),
        "output_record_ids": [row["id"] for row in outputs],
        "output_ids": [field_str(row, "Output_ID") for row in outputs],
        "review_email_to": cfg["review_email_to"],
        "email_subject": review_email_subject(len(outputs)),
    }

    if dry_run:
        return {"dry_run": True, **preview}

    html_body = build_review_email_html(cards)
    gmail = GmailClient()
    send_result = gmail.send_html(
        to=cfg["review_email_to"],
        subject=preview["email_subject"],
        html_body=html_body,
    )

    sent_at = datetime.now(timezone.utc).isoformat()
    updated: list[str] = []
    for output in outputs:
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {
                "Review_Status": REVIEW_STATUS_SENT,
                "Output_Status": OUTPUT_STATUS_READY,
                "Review_Email_Sent_At": sent_at,
            },
        )
        updated.append(output["id"])

    return {
        "processed": True,
        "route": "review_email",
        "gmail_message_id": send_result.get("id"),
        "updated_record_ids": updated,
        "sent_at": sent_at,
        **preview,
    }
