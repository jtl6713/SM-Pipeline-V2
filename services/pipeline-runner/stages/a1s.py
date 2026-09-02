from __future__ import annotations

from a1s.constants import MAKE_SCENARIO_ID
from a1s.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a1s",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "drive_file_id": (extra.get("drive_file_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "inline": as_bool(extra.get("inline")),
            "live_status": as_bool(extra.get("live_status")),
        },
        skip_message="A1S did not start an oversized compression job",
        ok_message="A1S started {started_count} compression jobs",
        dry_run_message="A1S dry-run preview (no local compression jobs)",
    )
