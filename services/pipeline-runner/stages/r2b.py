from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from r2b.constants import MAKE_SCENARIO_ID, MAX_RECORDS
from r2b.formulas import r2b_exact_output_formula, r2b_production_formula
from r2b.processor import process_batch


def run(request: StageRequest) -> StageResult:
    output_record_id = (request.output_record_id or request.platform_output_id or "").strip() or None
    test_run_id = (request.test_run_id or "").strip() or None
    dry_run = bool(request.extra.get("dry_run"))
    max_runs = MAX_RECORDS
    if isinstance(request.extra.get("max_runs"), int):
        max_runs = max(1, min(int(request.extra["max_runs"]), MAX_RECORDS))

    settings = load_settings()
    try:
        result = process_batch(
            output_record_id=output_record_id,
            test_run_id=test_run_id,
            max_runs=max_runs,
            dry_run=dry_run,
        )
    except Exception as exc:
        return StageResult(
            stage="r2b",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="r2b",
            status="ok",
            message="R2B dry-run preview (no Airtable writes)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        return StageResult(
            stage="r2b",
            status="skipped",
            message="No Platform Outputs matched the R2B retry selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    r2b_exact_output_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else r2b_production_formula()
                ),
                "run": result,
            },
        )
    return StageResult(
        stage="r2b",
        status="ok",
        message=f"Processed {result.get('processed_count', 0)} R2B retry output(s)",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
