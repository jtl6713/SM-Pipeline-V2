from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from r2.constants import MAKE_SCENARIO_ID
from r2.formulas import r2_exact_output_formula, r2_production_formula
from r2.processor import process_one


def run(request: StageRequest) -> StageResult:
    """
    R2 — auto asset selection for one Platform Output (Make scenario 5569495).

    One POST == one output row (Make Module 1 maxRecords=1).
    OpenAI canonical selection (Make modules 7–9) remains on Make until ported;
    zero-candidate fail-fast is implemented in Python.
    """
    output_record_id = (request.output_record_id or request.platform_output_id or "").strip() or None
    test_run_id = (request.test_run_id or "").strip() or None
    dry_run = bool(request.extra.get("dry_run"))

    settings = load_settings()
    max_runs = 1
    if isinstance(request.extra.get("max_runs"), int):
        max_runs = max(1, min(int(request.extra["max_runs"]), 5))

    runs: list[dict] = []
    deferred = False
    try:
        for _ in range(max_runs):
            result = process_one(
                output_record_id=output_record_id,
                test_run_id=test_run_id,
                dry_run=dry_run,
            )
            runs.append(result)
            if result.get("status") == "deferred":
                deferred = True
                break
            if not result.get("processed"):
                break
    except Exception as exc:
        return StageResult(
            stage="r2",
            status="error",
            message=str(exc),
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "output_record_id": output_record_id,
                "test_run_id": test_run_id,
                "runs": runs,
            },
        )

    processed_count = sum(1 for item in runs if item.get("processed"))
    if dry_run and runs:
        return StageResult(
            stage="r2",
            status="ok",
            message="R2 dry-run preview (no Airtable writes)",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "dry_run": True,
                "runs": runs,
                "service_version": settings["service_version"],
            },
        )

    if deferred:
        last = runs[-1] if runs else {}
        return StageResult(
            stage="r2",
            status="deferred",
            message=(
                "R2 claim/eligibility handled in Python; canonical OpenAI selection "
                f"still runs on Make scenario {MAKE_SCENARIO_ID} (modules 7–9)."
            ),
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "make_fallback_required": True,
                "output_record_id": output_record_id,
                "test_run_id": test_run_id,
                "runs": runs,
                "make_pointer": last.get("make_pointer"),
            },
        )

    if processed_count == 0:
        return StageResult(
            stage="r2",
            status="skipped",
            message="No eligible Platform Outputs matched the R2 selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    r2_exact_output_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else r2_production_formula()
                ),
                "runs": runs,
            },
        )

    return StageResult(
        stage="r2",
        status="ok",
        message=f"Processed {processed_count} R2 Platform Output(s)",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "output_record_id": output_record_id,
            "test_run_id": test_run_id,
            "processed_count": processed_count,
            "runs": runs,
            "service_version": settings["service_version"],
        },
    )
