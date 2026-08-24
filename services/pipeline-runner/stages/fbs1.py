from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from fbs1.constants import MAKE_SCENARIO_ID
from fbs1.processor import process_request
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
        "fbs1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="FBS1 did not start a Facebook slideshow render",
        ok_message="FBS1 queued Facebook slideshow render {job_id}",
        dry_run_message="FBS1 dry-run preview (no Remotion start or Airtable writes)",
    )
