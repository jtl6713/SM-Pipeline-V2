from __future__ import annotations

from c3b.constants import MAKE_SCENARIO_ID
from c3b.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    return run_named_stage(
        "c3b",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "action": request.extra.get("action"),
            "slide_id": request.extra.get("slide_id") or request.extra.get("slide_record_id"),
            "content_item_id": (
                request.content_item_record_id
                or request.extra.get("content_item_id")
                or request.extra.get("content_record_id")
            ),
            "notes": str(request.extra.get("notes") or ""),
            "test_run_id": (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None,
            "dry_run": bool(request.extra.get("dry_run")),
        },
        skip_message="C3B did not apply a review action",
        ok_message="C3B applied {action}",
        dry_run_message="C3B dry-run preview (no Airtable writes)",
    )
