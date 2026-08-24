from __future__ import annotations

from apc.ap3c import process_request
from apc.constants import MAKE_AP3C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap3c",
        request,
        make_id=MAKE_AP3C_ID,
        process=process_request,
        skip_message="AP3C did not create an Instagram carousel parent container",
        ok_message="AP3C created an Instagram carousel parent container",
        dry_run_message="AP3C dry-run preview (no Airtable writes)",
    )
