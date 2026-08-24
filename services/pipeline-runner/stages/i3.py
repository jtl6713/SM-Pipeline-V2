from __future__ import annotations

from i3.constants import MAKE_SCENARIO_ID
from i3.processor import process_request
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = dict(request.extra or {})
    if request.content_item_record_id and not extra.get("record_id"):
        extra["record_id"] = request.content_item_record_id
    return run_named_stage(
        "i3",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "payload": extra,
            "dry_run": bool(extra.get("dry_run")),
            "trigger_i4": extra.get("trigger_i4") is not False,
        },
        skip_message="I3 did not apply an idea decision",
        ok_message="I3 applied route {route}",
        dry_run_message="I3 dry-run preview (no Airtable writes)",
    )
