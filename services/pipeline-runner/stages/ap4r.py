from __future__ import annotations

from apc.ap4r import process_request
from apc.constants import MAKE_AP4R_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap4r",
        request,
        make_id=MAKE_AP4R_ID,
        process=process_request,
        skip_message="AP4R did not reconcile an Instagram carousel publish",
        ok_message="AP4R reconciled an Instagram carousel publish",
        dry_run_message="AP4R dry-run preview (no Airtable writes)",
    )
