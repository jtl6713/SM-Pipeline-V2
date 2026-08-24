from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from rr2.constants import MAKE_SCENARIO_ID
from rr2.processor import process_request


def run(request: StageRequest) -> StageResult:
    output_record_id = (
        request.output_record_id
        or request.platform_output_id
        or request.extra.get("record_id")
        or ""
    )
    if isinstance(output_record_id, str):
        output_record_id = output_record_id.strip() or None
    else:
        output_record_id = None

    decision = request.extra.get("decision")
    dry_run = bool(request.extra.get("dry_run"))
    skip_publisher_start = bool(request.extra.get("skip_publisher_start"))

    settings = load_settings()
    try:
        result = process_request(
            output_record_id=output_record_id,
            decision=str(decision) if decision is not None else None,
            dry_run=dry_run,
            skip_publisher_start=skip_publisher_start,
        )
    except Exception as exc:
        return StageResult(
            stage="rr2",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="rr2",
            status="ok",
            message="RR2 dry-run preview (no Airtable writes or publisher starts)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        reason = result.get("reason") or "not_processed"
        return StageResult(
            stage="rr2",
            status="skipped",
            message=f"RR2 did not apply a review decision ({reason})",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "run": result},
        )
    return StageResult(
        stage="rr2",
        status="ok",
        message=f"Applied RR2 {result.get('decision_label')} to output {result.get('output_id')}",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
