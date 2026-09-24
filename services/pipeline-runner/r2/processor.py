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


def _positive_number(record: dict[str, Any] | None, name: str) -> float:
    if not record:
        return 0.0
    try:
        value = float(record.get("fields", {}).get(name) or 0)
    except (TypeError, ValueError):
        return 0.0
    return value if value > 0 else 0.0


def _required_music_seconds(
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
) -> float:
    seconds = [
        _positive_number(output, "Studio_Effective_Video_Duration_Seconds"),
        _positive_number(output, "Video_Duration_Seconds_Override"),
        _positive_number(output, "Target_Final_Length"),
        _positive_number(content_item, "Content_Duration"),
    ]
    frames = _positive_number(output, "Render_Total_Frames")
    if frames:
        seconds.append(frames / 30.0)
    return max(seconds or [0.0])


def _music_duration(row: dict[str, Any]) -> float:
    try:
        value = float(row.get("fields", {}).get("Duration_Seconds") or 0)
    except (TypeError, ValueError):
        return 0.0
    return value if value > 0 else 0.0


def _duration_eligible_music(
    rows: list[dict[str, Any]],
    required_seconds: float,
) -> tuple[list[dict[str, Any]], bool]:
    if required_seconds <= 0:
        return rows, False
    known = [row for row in rows if _music_duration(row) > 0]
    qualifying = [
        row for row in known
        if _music_duration(row) + 0.05 >= required_seconds
    ]
    if qualifying:
        return qualifying, False
    # Keep the old catalog as a last resort when durations have not been measured yet
    # or there truly is no long-enough track. T1 performs a second hard guard before render.
    return rows, True


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

    content_item_id = _first_linked_id(output.get("fields", {}).get("Content_Item"))
    content_item = (
        client.get_record(CONTENT_ITEMS_TABLE, content_item_id) if content_item_id else None
    )
    required_music_seconds = _required_music_seconds(output, content_item)
    music_candidates, music_duration_fallback = _duration_eligible_music(
        music_candidates,
        required_music_seconds,
    )

    preview = {
        "output_record_id": output_id,
        "output_id": _field(output, "Output_ID"),
        "video_candidate_count": len(video_candidates),
        "music_candidate_count": len(music_candidates),
        "required_music_seconds": round(required_music_seconds, 3) if required_music_seconds else 0,
        "music_duration_fallback": music_duration_fallback,
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
    if music_duration_fallback and required_music_seconds > 0:
        refreshed = client.get_record(PLATFORM_OUTPUTS_TABLE, output_id)
        prior = str(refreshed.get("fields", {}).get("Asset_Selection_Notes") or "").rstrip()
        note = (
            f"Music duration guard fallback: no catalog track with a measured duration "
            f">= {required_music_seconds:.2f}s was available to R2. "
            "T1 will verify the selected track before render and replace it if a longer track exists."
        )
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output_id,
            {"Asset_Selection_Notes": f"{prior}\n{note}".strip()[:10000]},
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
