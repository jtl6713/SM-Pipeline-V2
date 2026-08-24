from __future__ import annotations

from a1m.constants import MAKE_SCENARIO_ID
from a1m.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a1m",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "drive_file_id": (extra.get("drive_file_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
            "inline": as_bool(extra.get("inline")),
        },
        skip_message="A1M did not probe oversized video duration",
        ok_message="A1M started {probed_count} duration probes",
        dry_run_message="A1M dry-run preview (no CloudConvert metadata jobs)",
    )
