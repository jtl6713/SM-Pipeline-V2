from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from item4.formulas import smv1_exact_request_formula
from item4.processor import process_one


def run(request: StageRequest) -> StageResult:
    """
    SMV1 — process one Studio Media Transfer Queue row (Make scenario 5894885).

    One POST == one queue row, matching Make Module 1 maxRecords=1 behavior.
    The Studio Worker drain loop calls this repeatedly until no eligible rows remain.
    """
    production_request_record_id = request.production_request_record_id
    test_run_id = (request.test_run_id or "").strip() or None

    if not production_request_record_id and not request.output_record_id:
        return StageResult(
            stage="smv1",
            status="error",
            message="production_request_record_id is required for pinned SMV1 drains",
        )

    settings = load_settings()
    max_runs = 1
    if isinstance(request.extra.get("max_runs"), int):
        max_runs = max(1, min(int(request.extra["max_runs"]), 20))

    runs: list[dict] = []
    try:
        for _ in range(max_runs):
            result = process_one(
                production_request_record_id=production_request_record_id,
                test_run_id=test_run_id,
            )
            runs.append(result)
            if not result.get("processed"):
                break
    except Exception as exc:
        return StageResult(
            stage="smv1",
            status="error",
            message=str(exc),
            details={
                "make_scenario_id": 5894885,
                "production_request_record_id": production_request_record_id,
                "test_run_id": test_run_id,
                "runs": runs,
            },
        )

    processed_count = sum(1 for item in runs if item.get("processed"))
    if processed_count == 0:
        return StageResult(
            stage="smv1",
            status="skipped",
            message="No eligible queue rows matched the SMV1 selector",
            details={
                "make_scenario_id": 5894885,
                "selector_formula": (
                    smv1_exact_request_formula(production_request_record_id, test_run_id or "")
                    if production_request_record_id
                    else None
                ),
                "runs": runs,
            },
        )

    return StageResult(
        stage="smv1",
        status="ok",
        message=f"Processed {processed_count} SMV1 queue row(s)",
        details={
            "make_scenario_id": 5894885,
            "production_request_record_id": production_request_record_id,
            "test_run_id": test_run_id,
            "processed_count": processed_count,
            "runs": runs,
            "service_version": settings["service_version"],
        },
    )
