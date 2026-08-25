from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from p0202.constants import MAKE_SCENARIO_ID
from p0202.processor import process_request
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    slide_record_id = str(extra.get("slide_record_id") or request.output_record_id or "").strip() or None
    return run_named_stage(
        "p0202",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "dry_run": as_bool(extra.get("dry_run")),
            "slide_record_id": slide_record_id,
        },
        skip_message="P020-2 did not generate a slide voiceover",
        ok_message="P020-2 generated voiceover for slide {slide_record_id}",
        dry_run_message="P020-2 dry-run preview (no paid audio or Airtable writes)",
    )
