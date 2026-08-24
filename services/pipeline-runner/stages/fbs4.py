from __future__ import annotations

from fbs3.constants import MAKE_POLL_SCENARIO_ID
from fbs3.poll import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    output_id = (
        request.output_record_id
        or request.platform_output_id
        or extra.get("output_record_id")
        or ""
    )
    if isinstance(output_id, str):
        output_id = output_id.strip() or None
    else:
        output_id = None
    return run_named_stage(
        "fbs4",
        request,
        make_id=MAKE_POLL_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="FBS4 did not finalize a Facebook Reel",
        ok_message="FBS4 processed Facebook Reel {video_id}",
        dry_run_message="FBS4 dry-run preview (no Graph poll or Airtable writes)",
    )
