from __future__ import annotations

import threading

from c2.constants import MAKE_SCENARIO_ID
from c2.processor import process_request
from config import StageRequest, StageResult
from stages._carousel import run_named_stage


def run(request: StageRequest) -> StageResult:
    content_id = (
        request.content_item_record_id or request.extra.get("content_record_id") or ""
    ).strip() or None
    test_run_id = (request.test_run_id or request.extra.get("test_run_id") or "").strip() or None
    kwargs = {
        "content_item_record_id": content_id,
        "test_run_id": test_run_id,
        "dry_run": bool(request.extra.get("dry_run")),
        "trigger_c3": request.extra.get("trigger_c3") is not False,
    }
    if request.extra.get("background") and not kwargs["dry_run"]:
        threading.Thread(
            target=process_request,
            kwargs=kwargs,
            daemon=True,
            name=f"c2-{content_id or 'unknown'}",
        ).start()
        return StageResult(
            stage="c2",
            status="ok",
            message="C2 started in background",
            details={"make_scenario_id": MAKE_SCENARIO_ID, "background": True, "content_item_record_id": content_id},
        )
    return run_named_stage(
        "c2",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs=kwargs,
        skip_message="C2 did not generate carousel slides",
        ok_message="C2 generated AI carousel slides",
        dry_run_message="C2 dry-run preview (no image generation or writes)",
    )
