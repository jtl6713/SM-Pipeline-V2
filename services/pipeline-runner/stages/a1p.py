from __future__ import annotations

from a1p.constants import MAKE_SCENARIO_ID
from a1p.processor import process_request
from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "a1p",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "job_id": extra.get("job_id"),
            "state_record_id": extra.get("state_record_id"),
            "source_file_id": extra.get("source_file_id"),
            "source_name": extra.get("source_name"),
            "source_size": extra.get("source_size"),
            "permission_id": extra.get("permission_id"),
            "attempt": extra.get("attempt"),
            "poller_url": extra.get("poller_url"),
            "dry_run": as_bool(extra.get("dry_run")),
        },
        skip_message="A1P did not poll a CloudConvert job",
        ok_message="A1P poll status {status}",
        dry_run_message="A1P dry-run preview (no CloudConvert poll)",
    )
