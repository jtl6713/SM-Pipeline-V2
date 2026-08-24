from __future__ import annotations

from c8.constants import MAKE_SCENARIO_ID
from c8.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    content_id = (
        request.content_item_record_id or request.extra.get("content_record_id") or ""
    ).strip() or None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    return run_named_stage(
        "c8",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "content_item_record_id": content_id,
            "test_run_id": test_run_id,
            "dry_run": bool(request.extra.get("dry_run")),
            "trigger_c9": request.extra.get("trigger_c9") is not False,
        },
        skip_message="C8 did not create or update a platform output",
        ok_message="C8 upserted carousel platform output(s)",
        dry_run_message="C8 dry-run preview (no output writes or C9)",
    )
