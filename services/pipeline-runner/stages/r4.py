from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from r4.constants import MAKE_SCENARIO_ID
from r4.formulas import r4_exact_output_formula, r4_production_formula
from r4.processor import process_one


def run(request: StageRequest) -> StageResult:
    output_record_id = (request.output_record_id or request.platform_output_id or "").strip() or None
    test_run_id = (request.test_run_id or "").strip() or None
    dry_run = bool(request.extra.get("dry_run"))
    settings = load_settings()

    try:
        result = process_one(
            output_record_id=output_record_id,
            test_run_id=test_run_id,
            dry_run=dry_run,
        )
    except Exception as exc:
        return StageResult(
            stage="r4",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if dry_run and result.get("dry_run"):
        return StageResult(
            stage="r4",
            status="ok",
            message="R4 dry-run preview (no Remotion/Airtable writes)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        return StageResult(
            stage="r4",
            status="skipped",
            message="No eligible Platform Output matched the R4 selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    r4_exact_output_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else r4_production_formula()
                ),
                "run": result,
            },
        )
    return StageResult(
        stage="r4",
        status="ok",
        message="Started Remotion render for one Platform Output",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
