from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from fbs1.constants import MAKE_POLL_SCENARIO_ID
from fbs1.poll import process_request
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
        "fbs2",
        request,
        make_id=MAKE_POLL_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="FBS2 did not stage a Facebook slideshow MP4",
        ok_message="FBS2 processed Facebook slideshow {output_record_id}",
        dry_run_message="FBS2 dry-run preview (no Drive/R2 writes)",
    )
