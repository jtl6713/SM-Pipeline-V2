from __future__ import annotations

from i4.constants import MAKE_SCENARIO_ID
from i4.processor import process_request
from config import StageRequest
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    record_id = str(
        extra.get("record_id")
        or extra.get("idea_record_id")
        or request.content_item_record_id
        or ""
    ).strip() or None
    return run_named_stage(
        "i4",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "record_id": record_id,
            "dry_run": bool(extra.get("dry_run")),
        },
        skip_message="I4 did not promote a Content Item",
        ok_message="I4 promoted Content Item {content_item_id}",
        dry_run_message="I4 dry-run preview (no Airtable writes)",
    )
