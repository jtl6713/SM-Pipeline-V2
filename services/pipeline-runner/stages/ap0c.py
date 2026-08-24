from __future__ import annotations

from apc.ap0c import process_request
from apc.constants import MAKE_AP0C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap0c",
        request,
        make_id=MAKE_AP0C_ID,
        process=process_request,
        skip_message="AP0C did not prepare Instagram carousel public assets",
        ok_message="AP0C prepared Instagram carousel public assets",
        dry_run_message="AP0C dry-run preview (no Airtable writes)",
    )
