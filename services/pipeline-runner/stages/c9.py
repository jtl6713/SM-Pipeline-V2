from __future__ import annotations

from c9.constants import MAKE_SCENARIO_ID
from c9.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    output_id = (
        request.output_record_id
        or request.platform_output_id
        or request.extra.get("output_record_id")
        or ""
    )
    if isinstance(output_id, str):
        output_id = output_id.strip() or None
    else:
        output_id = None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    return run_named_stage(
        "c9",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": test_run_id,
            "dry_run": bool(request.extra.get("dry_run")),
        },
        skip_message="C9 did not mark the output ready to publish",
        ok_message="C9 marked the carousel output Ready to Publish",
        dry_run_message="C9 dry-run preview (no publish-status write)",
    )
