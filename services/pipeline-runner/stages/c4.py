from __future__ import annotations

from c4.constants import MAKE_SCENARIO_ID
from c4.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    slide_id = str(
        request.extra.get("slide_record_id") or request.extra.get("slide_id") or ""
    ).strip() or None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    return run_named_stage(
        "c4",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "slide_record_id": slide_id,
            "test_run_id": test_run_id,
            "dry_run": bool(request.extra.get("dry_run")),
        },
        skip_message="C4 did not apply a review decision",
        ok_message="C4 applied route {route}",
        dry_run_message="C4 dry-run preview (no Airtable writes or daisy-chain)",
    )
