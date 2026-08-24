from __future__ import annotations

from a2.constants import MAKE_SCENARIO_ID
from a2.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a2",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "trigger_a2b": extra.get("trigger_a2b") is not False,
            "wait_for_next": extra.get("wait_for_next") is not False,
        },
        skip_message="A2 did not intake Drive files",
        ok_message="A2 intaken {intaken_count} files",
        dry_run_message="A2 dry-run preview (no Drive moves or Airtable writes)",
    )
