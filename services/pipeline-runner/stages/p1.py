from __future__ import annotations

from asset.helpers import as_bool, parse_int
from config import StageRequest
from p1.constants import MAKE_SCENARIO_ID, P1_MAX_RECORDS
from p1.processor import process_request
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "p1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "content_item_record_id": (
                request.content_item_record_id or extra.get("content_record_id") or extra.get("content_item_record_id") or ""
            ).strip()
            or None,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "max_runs": parse_int(extra.get("max_runs"), P1_MAX_RECORDS) or P1_MAX_RECORDS,
            "trigger_next": extra.get("trigger_next") is not False,
        },
        skip_message="P1 did not generate a content package",
        ok_message="P1 packaged {packaged_count} content items",
        dry_run_message="P1 dry-run preview (no OpenAI or Airtable writes)",
    )
