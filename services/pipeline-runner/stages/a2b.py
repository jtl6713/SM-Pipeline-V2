from __future__ import annotations

from a2b.constants import MAKE_SCENARIO_ID
from a2b.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a2b",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "trigger_a3": extra.get("trigger_a3") is True,
            "wait_for_next": extra.get("wait_for_next") is not False,
            "drain": as_bool(extra.get("drain")),
        },
        skip_message="A2B did not backfill Drive videos",
        ok_message="A2B backfilled {backfill_count} videos",
        dry_run_message="A2B dry-run preview (no Drive moves or Airtable writes)",
    )
