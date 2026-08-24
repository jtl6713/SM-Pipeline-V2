from __future__ import annotations

from apc.ap1c import process_request
from apc.constants import MAKE_AP1C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap1c",
        request,
        make_id=MAKE_AP1C_ID,
        process=process_request,
        skip_message="AP1C did not create Instagram carousel child containers",
        ok_message="AP1C created Instagram carousel child containers",
        dry_run_message="AP1C dry-run preview (no Airtable writes)",
    )
