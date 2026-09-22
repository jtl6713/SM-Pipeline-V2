from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from rr1.constants import MAKE_SCENARIO_ID, MAX_RECORDS
from rr1.formulas import rr1_exact_output_formula, rr1_production_formula
from rr1.processor import process_batch


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
            stage="rr1",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="rr1",
            status="ok",
            message="RR1 dry-run preview (no email or Airtable writes)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        if result.get("reason") == "review_email_disabled":
            return StageResult(
                stage="rr1",
                status="skipped",
                message="Ready-for-review email is disabled; review in Studio Pipeline",
                details={"make_scenario_id": MAKE_SCENARIO_ID, "run": result},
            )
        return StageResult(
            stage="rr1",
            status="skipped",
            message="No review-eligible Platform Outputs matched the RR1 selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    rr1_exact_output_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else rr1_production_formula()
                ),
                "run": result,
            },
        )
    return StageResult(
        stage="rr1",
        status="ok",
        message=f"Sent review email for {result.get('output_count', 0)} Platform Output(s)",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
