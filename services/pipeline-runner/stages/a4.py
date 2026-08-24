from __future__ import annotations

from a4.constants import MAKE_SCENARIO_ID
from a4.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a4",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "max_records": extra.get("max_records"),
        },
        skip_message="A4 did not reconcile Drive assets",
        ok_message="A4 checked {checked_count} assets",
        dry_run_message="A4 dry-run preview (no Airtable deletes or Drive trash)",
    )
