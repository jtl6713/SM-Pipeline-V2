from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from r5.constants import MAKE_SCENARIO_ID, MAX_RECORDS
from r5.processor import process_batch


def run(request: StageRequest) -> StageResult:
    output_record_id = (request.output_record_id or request.platform_output_id or "").strip() or None
    test_run_id = (request.test_run_id or "").strip() or None
    dry_run = bool(request.extra.get("dry_run"))
    max_runs = MAX_RECORDS
    if isinstance(request.extra.get("max_runs"), int):
        max_runs = max(1, min(int(request.extra["max_runs"]), MAX_RECORDS))

    settings = load_settings()
    try:
        runs = process_batch(
            output_record_id=output_record_id,
            test_run_id=test_run_id,
            max_runs=max_runs,
            dry_run=dry_run,
        )
    except Exception as exc:
        return StageResult(
            stage="r5",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID, "runs": []},
        )

    processed_count = sum(1 for item in runs if item.get("processed"))
    if dry_run and runs:
        return StageResult(
            stage="r5",
            status="ok",
            message="R5 dry-run preview (no poll/upload writes)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "runs": runs},
        )
    if processed_count == 0:
        return StageResult(
            stage="r5",
            status="skipped",
            message="No rendering Platform Outputs required R5 action this tick",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "runs": runs},
        )
    return StageResult(
        stage="r5",
        status="ok",
        message=f"Processed {processed_count} R5 Platform Output(s)",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "processed_count": processed_count,
            "runs": runs,
            "service_version": settings["service_version"],
        },
    )
