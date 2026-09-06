from __future__ import annotations

from a3.constants import MAKE_SCENARIO_ID
from a3.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a3",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "trigger_a4": extra.get("trigger_a4") is not False,
            "wait_for_next": extra.get("wait_for_next") is not False,
            "max_records": extra.get("max_records"),
            "drain": as_bool(extra.get("drain")),
        },
        skip_message="A3 did not classify media assets",
        ok_message="A3 classified {classified_count} assets",
        dry_run_message="A3 dry-run preview (no OpenAI or Airtable writes)",
    )
