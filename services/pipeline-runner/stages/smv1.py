from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from item4.formulas import smv1_exact_request_formula
from item4.processor import process_drain


def run(request: StageRequest) -> StageResult:
    """
    SMV1 — drain Studio Media Transfer Queue rows (Make scenario 5894885).

    Pending platform variants for the same photo share one Drive download.
    Up to four photos crop in parallel. Follow-up rows (previews, masters)
    still run one at a time.
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

    try:
        result = process_drain(
            production_request_record_id=production_request_record_id,
            test_run_id=test_run_id,
            photo_workers=4,
            max_followup=max_runs,
        )
    except Exception as exc:
        return StageResult(
            stage="smv1",
            status="error",
            message=str(exc),
            details={
                "make_scenario_id": 5894885,
                "production_request_record_id": production_request_record_id,
                "test_run_id": test_run_id,
            },
        )

    processed_count = int(result.get("processed_count") or 0)
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
                "runs": [result],
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
            "photo_groups": result.get("photo_groups"),
            "runs": [result],
            "service_version": settings["service_version"],
        },
    )
