from __future__ import annotations

from apc.ap4c import process_request
from apc.constants import MAKE_AP4C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap4c",
        request,
        make_id=MAKE_AP4C_ID,
        process=process_request,
        skip_message="AP4C did not publish an Instagram carousel",
        ok_message="AP4C published an Instagram carousel",
        dry_run_message="AP4C dry-run preview (no Airtable writes)",
    )
