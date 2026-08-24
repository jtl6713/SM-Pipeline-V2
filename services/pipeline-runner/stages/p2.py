from __future__ import annotations

from config import StageRequest, StageResult, load_settings
from p2.constants import MAKE_SCENARIO_ID
from p2.formulas import p2_exact_content_formula
from p2.processor import process_request


def run(request: StageRequest) -> StageResult:
    content_item_record_id = (
        request.content_item_record_id or request.extra.get("content_record_id") or ""
    ).strip() or None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    dry_run = bool(request.extra.get("dry_run"))

    settings = load_settings()
    try:
        result = process_request(
            content_item_record_id=content_item_record_id,
            test_run_id=test_run_id,
            dry_run=dry_run,
        )
    except Exception as exc:
        return StageResult(
            stage="p2",
            status="error",
            message=str(exc),
            details={"make_scenario_id": MAKE_SCENARIO_ID},
        )

    if result.get("dry_run"):
        return StageResult(
            stage="p2",
            status="ok",
            message="P2 dry-run preview (no paid media work or Airtable writes)",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        return StageResult(
            stage="p2",
            status="skipped",
            message="Content Item did not match an eligible P2 route",
            details={
                "make_scenario_id": MAKE_SCENARIO_ID,
                "selector_formula": (
                    p2_exact_content_formula(content_item_record_id, test_run_id or "")
                    if content_item_record_id
                    else None
                ),
                "run": result,
            },
        )
    return StageResult(
        stage="p2",
        status="ok",
        message=f"P2 completed route {result.get('route')}",
        details={
            "make_scenario_id": MAKE_SCENARIO_ID,
            "run": result,
            "service_version": settings["service_version"],
        },
    )
