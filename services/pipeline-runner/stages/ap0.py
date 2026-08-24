from __future__ import annotations

from ap0.constants import MAKE_SCENARIO_ID
from ap0.processor import process_request
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
        "ap0",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="AP0 did not stage a public publish asset",
        ok_message="AP0 staged {publish_asset_file_name}",
        dry_run_message="AP0 dry-run preview (no Drive download, R2 upload, or Airtable writes)",
    )
