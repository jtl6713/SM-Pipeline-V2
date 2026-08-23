from __future__ import annotations

from config import StageRequest, StageResult
from p3.constants import MAKE_SCENARIO_ID
from p3.processor import process_request


def run(request: StageRequest) -> StageResult:
    content_item_record_id = (
        request.content_item_record_id or request.extra.get("content_item_record_id") or ""
    ).strip() or None
    dry_run = bool(request.extra.get("dry_run"))
    result = process_request(content_item_record_id=content_item_record_id, dry_run=dry_run)
    return StageResult(
        stage="p3",
        status="deferred",
        message="P3 Python port not implemented — Worker should pulse Make webhook",
        details={"make_scenario_id": MAKE_SCENARIO_ID, **result},
    )
