from __future__ import annotations

from apc.ap2c import process_request
from apc.constants import MAKE_AP2C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap2c",
        request,
        make_id=MAKE_AP2C_ID,
        process=process_request,
        skip_message="AP2C did not poll Instagram carousel child containers",
        ok_message="AP2C polled Instagram carousel child containers",
        dry_run_message="AP2C dry-run preview (no Airtable writes)",
    )
