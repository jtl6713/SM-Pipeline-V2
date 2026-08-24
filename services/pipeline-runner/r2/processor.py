"""R2 processor — one Platform Output per invocation (Make scenario 5569495)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from r2.candidates import fetch_music_candidates, fetch_video_candidates
from r2.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from r2.formulas import r2_exact_output_formula, r2_production_formula
from r2.openai_selection import select_canonical_package
from r2.p4_webhook import trigger_p4
from r2.updates import apply_selection, fail_fast_zero_candidates, mark_selecting


def _field(record: dict[str, Any], name: str) -> str:
    return str(record.get("fields", {}).get(name) or "").strip()


def _first_linked_id(value: Any) -> str | None:
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, str) and first.startswith("rec"):
            return first
    if isinstance(value, str) and value.startswith("rec"):
        return value
    return None


def select_next_output(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
) -> dict | None:
    if output_record_id:
        formula = r2_exact_output_formula(output_record_id, test_run_id or "")
    else:
        formula = r2_production_formula()
    rows = client.list_records(PLATFORM_OUTPUTS_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def process_one(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    output = select_next_output(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
    )
    if not output:
        return {
            "processed": False,
            "reason": "no_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
        }

    output_id = output["id"]
    video_candidates = fetch_video_candidates(client)
    music_candidates = fetch_music_candidates(client)

    preview = {
        "output_record_id": output_id,
        "output_id": _field(output, "Output_ID"),
        "video_candidate_count": len(video_candidates),
        "music_candidate_count": len(music_candidates),
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }

    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    if not video_candidates:
        mark_selecting(client, output)
        fail_fast_zero_candidates(client, output)
        p4_result = trigger_p4(output, reason="zero eligible video candidates")
        return {
            "processed": True,
            "route": "fail_fast_zero_candidates",
            "p4": p4_result,
            **preview,
        }

    content_item_id = _first_linked_id(output.get("fields", {}).get("Content_Item"))
    content_item = (
        client.get_record(CONTENT_ITEMS_TABLE, content_item_id) if content_item_id else None
    )

    mark_selecting(client, output)
    selection = select_canonical_package(
        output=output,
        content_item=content_item,
        video_candidates=video_candidates,
        music_candidates=music_candidates,
    )
    apply_selection(
        client,
        output,
        raw_text=selection["raw_text"],
        parsed=selection["parsed"],
        video_candidate_count=len(video_candidates),
    )

    parsed = selection["parsed"]
    p4_result = None
    if str(parsed.get("selection_status") or "") != "Selected":
        p4_result = trigger_p4(output, reason="asset selection not selected")

    return {
        "processed": True,
        "route": "openai_selection",
        "selection_status": parsed.get("selection_status"),
        "p4": p4_result,
        **preview,
    }
