from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from p4.constants import MAKE_SCENARIO_ID
from p4.formulas import p4_exact_record_formula, p4_output_id_formula
from p4.processor import process_one


def run(request: StageRequest) -> StageResult:
    output_record_id = (request.output_record_id or request.platform_output_id or "").strip() or None
    output_id = str(request.extra.get("output_id") or "").strip() or None
    test_run_id = (request.test_run_id or str(request.extra.get("test_run_id") or "")).strip() or None
    dry_run = bool(request.extra.get("dry_run"))
    trigger_p5 = request.extra.get("trigger_p5")
    if trigger_p5 is None:
        trigger_p5 = True

    settings = load_settings()
    try:
        result = process_one(
            output_record_id=output_record_id,
            output_id=output_id,
            test_run_id=test_run_id,
            dry_run=dry_run,
            trigger_p5=bool(trigger_p5),
        )
    except Exception as exc:
        return StageResult(
            stage="p4",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="p4",
            status="ok",
            message="P4 dry-run preview (no Airtable writes or email)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        return StageResult(
            stage="p4",
            status="skipped",
            message="No exact Platform Output matched the P4 webhook selector",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    p4_exact_record_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else p4_output_id_formula(output_id or 0, test_run_id or "")
                    if output_id
                    else None
                ),
                "run": result,
            },
        )
    return StageResult(
        stage="p4",
        status="ok",
        message=f"P4 {result.get('route')} for output {result.get('output_id')}",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
