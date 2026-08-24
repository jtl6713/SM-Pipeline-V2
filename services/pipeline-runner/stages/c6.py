from __future__ import annotations

from c6.constants import MAKE_SCENARIO_ID
from c6.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    content_id = (
        request.content_item_record_id or request.extra.get("content_record_id") or ""
    ).strip() or None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    return run_named_stage(
        "c6",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "content_item_record_id": content_id,
            "test_run_id": test_run_id,
            "dry_run": bool(request.extra.get("dry_run")),
            "trigger_c7": request.extra.get("trigger_c7") is not False,
        },
        skip_message="C6 did not watermark slides",
        ok_message="C6 watermarked approved carousel slides",
        dry_run_message="C6 dry-run preview (no watermark or writes)",
    )
