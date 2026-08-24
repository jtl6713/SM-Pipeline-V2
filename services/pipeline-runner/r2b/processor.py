"""R2B processor — retry asset selection (Make 5576620)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from r2.candidates import fetch_music_candidates, fetch_video_candidates
from r2.openai_selection import select_canonical_package
from r2.updates import apply_selection
from r2b.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, MAX_RECORDS, RETRY_VIEW
from r2b.formulas import r2b_exact_output_formula, r2b_production_formula
from r2b.updates import fail_fast_zero_candidates, mark_retry_started, rollback_retryable
from render.fields import field_str, first_linked_id


def select_outputs(
    client: AirtableClient,
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_records: int = MAX_RECORDS,
) -> list[dict[str, Any]]:
    if output_record_id:
        return client.list_records(
            PLATFORM_OUTPUTS_TABLE,
            formula=r2b_exact_output_formula(output_record_id, test_run_id or ""),
            max_records=1,
        )
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=r2b_production_formula(),
        view=RETRY_VIEW,
        max_records=max_records,
    )


def process_one(
    client: AirtableClient,
    output: dict[str, Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = {
        "output_record_id": output["id"],
        "output_id": field_str(output, "Output_ID"),
        "asset_selection_status": field_str(output, "Asset_Selection_Status"),
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }
    video_candidates = fetch_video_candidates(client)
    music_candidates = fetch_music_candidates(client)
    preview["video_candidate_count"] = len(video_candidates)
    preview["music_candidate_count"] = len(music_candidates)

    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    mark_retry_started(client, output)
    if not video_candidates:
        fail_fast_zero_candidates(client, output)
        return {"processed": True, "route": "fail_fast_zero_candidates", **preview}

    content_item_id = first_linked_id(output.get("fields", {}).get("Content_Item"))
    content_item = (
        client.get_record(CONTENT_ITEMS_TABLE, content_item_id) if content_item_id else None
    )
    try:
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
    except Exception as exc:
        rollback_retryable(client, output, exc)
        return {
            "processed": True,
            "route": "rollback",
            "error": str(exc),
            **preview,
        }

    parsed = selection["parsed"]
    return {
        "processed": True,
        "route": "openai_selection",
        "selection_status": parsed.get("selection_status"),
        **preview,
    }


def process_batch(
    *,
    output_record_id: str | None = None,
    test_run_id: str | None = None,
    max_runs: int = MAX_RECORDS,
    dry_run: bool = False,
) -> dict[str, Any]:
    client = AirtableClient()
    outputs = select_outputs(
        client,
        output_record_id=output_record_id,
        test_run_id=test_run_id,
        max_records=max_runs,
    )
    if not outputs:
        return {
            "processed": False,
            "reason": "no_r2b_eligible_platform_output",
            "make_scenario_id": MAKE_SCENARIO_ID,
            "runs": [],
        }

    runs = [
        process_one(client, output, dry_run=dry_run)
        for output in outputs
    ]
    processed_count = sum(1 for run in runs if run.get("processed"))
    return {
        "processed": processed_count > 0,
        "processed_count": processed_count,
        "dry_run": dry_run,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "runs": runs,
    }
