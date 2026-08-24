from __future__ import annotations

from i2.constants import MAKE_SCENARIO_ID
from i2.processor import process_request
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "i2",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": bool(extra.get("dry_run")),
        },
        skip_message="I2 did not send a review email",
        ok_message="I2 emailed {sent_count} idea candidates",
        dry_run_message="I2 dry-run preview (no email)",
    )
