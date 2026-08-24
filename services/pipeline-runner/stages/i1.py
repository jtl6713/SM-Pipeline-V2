from __future__ import annotations

from i1.constants import MAKE_SCENARIO_ID
from i1.processor import process_request
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "i1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "profile_record_id": str(extra.get("profile_record_id") or extra.get("profile_id") or "").strip() or None,
            "batch_record_id": str(extra.get("batch_record_id") or extra.get("batch_id") or "").strip() or None,
            "requested_count": extra.get("requested_count") or extra.get("count"),
            "quality": extra.get("quality"),
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": bool(extra.get("dry_run")),
            "trigger_i2": extra.get("trigger_i2") is not False,
        },
        skip_message="I1 did not create idea candidates",
        ok_message="I1 created {created_count} idea candidates",
        dry_run_message="I1 dry-run preview (no Airtable writes)",
    )
