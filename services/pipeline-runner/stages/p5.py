from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from p5.constants import MAKE_SCENARIO_ID, MAX_RECORDS
from p5.formulas import p5_production_formula
from p5.processor import process_batch


def run(request: StageRequest) -> StageResult:
    dry_run = bool(request.extra.get("dry_run"))
    max_records = MAX_RECORDS
    if isinstance(request.extra.get("max_records"), int):
        max_records = max(1, min(int(request.extra["max_records"]), MAX_RECORDS))

    settings = load_settings()
    try:
        result = process_batch(dry_run=dry_run, max_records=max_records)
    except Exception as exc:
        return StageResult(
            stage="p5",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="p5",
            status="ok",
            message="P5 dry-run preview (no email)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        return StageResult(
            stage="p5",
            status="skipped",
            message="No open Asset Request Shots matched the P5 reminder selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": p5_production_formula(),
                "run": result,
            },
        )
    return StageResult(
        stage="p5",
        status="ok",
        message=f"Sent P5 reminder for {result.get('open_shot_count', 0)} open shot(s)",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
