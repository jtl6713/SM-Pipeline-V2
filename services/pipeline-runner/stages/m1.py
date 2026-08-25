from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from m1.constants import MAKE_SCENARIO_ID
from m1.processor import process_request
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "m1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="M1 did not reset a stale render job",
        ok_message="M1 reset {reset_count} stale render jobs",
        dry_run_message="M1 dry-run preview (no Airtable writes)",
    )
