"""RR2 processor — render review decision handler (Make 5576353)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from render.fields import field_str
from rr2.constants import DECISION_APPROVED, DECISION_LABELS, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from rr2.decisions import decision_fields, normalize_decision
from rr2.publisher import start_publisher_cadence


def process_request(
    *,
    output_record_id: str | None,
    decision: str | None,
    dry_run: bool = False,
    skip_publisher_start: bool = False,
) -> dict[str, Any]:
    record_id = str(output_record_id or "").strip()
    normalized = normalize_decision(decision)
    if not record_id:
        return {
            "processed": False,
            "reason": "missing_record_id",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }
    if not normalized:
        return {
            "processed": False,
            "reason": "unknown_decision",
            "decision": decision,
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    client = AirtableClient()
    try:
        output = client.get_record(PLATFORM_OUTPUTS_TABLE, record_id)
    except Exception:
        return {
            "processed": False,
            "reason": "missing_platform_output",
            "output_record_id": record_id,
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    fields = decision_fields(normalized, field_str(output, "Output_Notes"))
    preview = {
        "processed": False,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "route": normalized,
        "decision_label": DECISION_LABELS[normalized],
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "platform": field_str(output, "Platform"),
        "output_status_before": field_str(output, "Output_Status"),
        "review_status_before": field_str(output, "Review_Status"),
        "fields": fields,
        "starts_publisher_cadence": normalized == DECISION_APPROVED and not skip_publisher_start,
    }

    if dry_run:
        return {"dry_run": True, **preview}

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], fields, typecast=True)
    publisher: list[dict[str, Any]] = []
    if normalized == DECISION_APPROVED and not skip_publisher_start:
        publisher = start_publisher_cadence(client)

    return {
        **preview,
        "processed": True,
        "publisher_starts": publisher,
    }
