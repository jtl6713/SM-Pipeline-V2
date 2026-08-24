from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from lettering.constants import MAX_RECORDS
from lettering.formulas import lettering_exact_output_formula, lettering_production_formula
from lettering.processor import process_batch


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
            stage="letter",
            status="error",
            message=str(exc),
            details={"runs": []},
        )

    processed_count = sum(1 for item in runs if item.get("processed"))
    if dry_run and runs:
        return StageResult(
            stage="letter",
            status="ok",
            message="Native JPEG lettering dry-run (no writes)",
            details={"dry_run": True, "runs": runs},
        )
    if processed_count == 0:
        return StageResult(
            stage="letter",
            status="skipped",
            message="No native stills needed JPEG lettering",
            details={
                "selector_formula": (
                    lettering_exact_output_formula(output_record_id, test_run_id or "")
                    if output_record_id
                    else lettering_production_formula()
                ),
                "runs": runs,
            },
        )
    return StageResult(
        stage="letter",
        status="ok",
        message=f"Lettered {processed_count} native Platform Output(s)",
        details={
            "processed_count": processed_count,
            "runs": runs,
            "service_version": settings["service_version"],
        },
    )
