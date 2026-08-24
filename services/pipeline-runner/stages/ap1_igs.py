from __future__ import annotations

from ap1_igs.constants import MAKE_SCENARIO_ID
from ap1_igs.processor import process_request
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
        "ap1_igs",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "output_record_id": output_id,
            "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
            "replace_transaction_id": str(extra.get("replace_transaction_id") or "").strip() or None,
            "replace_fingerprint": str(extra.get("replace_fingerprint") or "").strip() or None,
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="AP1-IGS did not create an Instagram Story container",
        ok_message="AP1-IGS created Instagram Story container {container_id}",
        dry_run_message="AP1-IGS dry-run preview (no Graph create or Airtable writes)",
    )
