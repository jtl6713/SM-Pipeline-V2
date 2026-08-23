"""R3 processor — render prep from Selected_Assets_JSON (Make 5557966)."""

from __future__ import annotations

import json
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from r3.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MAX_RECORDS
from r3.formulas import r3_exact_output_formula, r3_production_formula
from r3.render_prep import build_update_fields
from render.fields import field_str, first_linked_id, parse_json_field


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        formula = r3_exact_output_formula(output_record_id, test_run_id or "")
        max_records = 1
    else:
        formula = r3_production_formula()
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=formula,
        max_records=max_records,
    )


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=1,
    )
    if not outputs:
        return {
            "processed": False,
            "reason": "no_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    output = outputs[0]
    raw_json = field_str(output, "Selected_Assets_JSON")
    if not raw_json:
        return {
            "processed": False,
            "reason": "missing_selected_assets_json",
            "output_record_id": output["id"],
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    try:
        package = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        return {
            "processed": False,
            "reason": "invalid_selected_assets_json",
            "output_record_id": output["id"],
            "error": str(exc),
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    content_item = None
    content_item_id = first_linked_id(output.get("fields", {}).get("Content_Item"))
    if content_item_id:
        content_item = client.get_record(CONTENT_ITEMS_TABLE, content_item_id)

    update_fields = build_update_fields(output, package, content_item)
    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "selection_status": package.get("selection_status"),
        "render_status": (package.get("render_prep") or {}).get("render_status"),
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "would_update": list(update_fields.keys()) if update_fields else [],
    }

    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    if not update_fields:
        return {
            "processed": False,
            "reason": "package_not_ready_for_render_prep",
            **preview,
        }

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], update_fields)
    return {"processed": True, "route": "render_prep", **preview}


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=max_runs,
    )
    if not outputs:
        return [
            {
                "processed": False,
                "reason": "no_eligible_platform_output",
                "make_scenario_id": MAKE_SCENARIO_ID,
            }
        ]

    results: list[dict[str, Any]] = []
    for output in outputs:
        result = process_one(
            output_record_id=output["id"],
            test_run_id=test_run_id,
            dry_run=dry_run,
        )
        results.append(result)
        if dry_run:
            break
    return results
