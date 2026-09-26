"""P5 processor — open asset-needs reminder (Make 5536624)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import ASSET_REQUEST_SHOTS_TABLE, CONTENT_ITEMS_TABLE
from config import load_settings
from integrations.gmail import GmailClient
from p5.constants import (
    DEFAULT_EMAIL_TO,
    MAKE_SCENARIO_ID,
    MAKE_SCENARIO_NAME,
    MAX_RECORDS,
    OPEN_SHOTS_VIEW,
    P5_EMAIL_ENABLED,
)
from p5.email_builder import reminder_html, reminder_subject, shot_card
from p5.formulas import p5_production_formula
from render.fields import field, field_str, first_linked_id


def _sort_key(shot: dict[str, Any]) -> tuple[str, str, int]:
    fields = shot.get("fields", {})
    location = str(fields.get("Location") or "")
    content = ""
    linked = fields.get("Content_Item")
    if isinstance(linked, list) and linked:
        content = str(linked[0])
    number = int(fields.get("Shot_Number") or 0)
    return (location, content, number)


def process_batch(*, dry_run: bool = False, max_records: int = MAX_RECORDS) -> dict[str, Any]:
    client = AirtableClient()
    shots = client.list_records(
        ASSET_REQUEST_SHOTS_TABLE,
        formula=p5_production_formula(),
        view=OPEN_SHOTS_VIEW,
        max_records=max_records,
    )
    shots.sort(key=_sort_key)
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "open_shot_count": len(shots),
        "shot_ids": [shot["id"] for shot in shots[:20]],
    }
    if not shots:
        return {"processed": False, "reason": "no_open_asset_request_shots", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if not P5_EMAIL_ENABLED:
        return {"processed": False, "reason": "email_disabled", **preview}

    cards: list[str] = []
    titles: dict[str, str] = {}
    for shot in shots:
        content_id = first_linked_id(field(shot, "Content_Item"))
        title = titles.get(content_id or "")
        if content_id and title is None:
            item = client.get_record(CONTENT_ITEMS_TABLE, content_id)
            title = field_str(item, "Content_Title")
            titles[content_id] = title
        cards.append(shot_card(shot, title or ""))

    settings = load_settings()
    to_addr = str(settings.get("p5_email_to") or DEFAULT_EMAIL_TO).strip()
    gmail = GmailClient()
    try:
        send_result = gmail.send_html(
            to=to_addr,
            subject=reminder_subject(len(shots)),
            html_body=reminder_html(cards, count=len(shots)),
        )
    except Exception as exc:
        text = str(exc)
        if "gmail.googleapis.com" in text and "403" in text:
            raise RuntimeError(
                "P5 Gmail send failed: Gmail API is disabled on Google Cloud project "
                "198619707196. Enable it at "
                "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=198619707196 "
                "then retry POST /stages/p5."
            ) from exc
        raise
    return {
        "processed": True,
        "gmail_message_id": send_result.get("id"),
        **preview,
    }
