from __future__ import annotations

from apc.ap5c import process_request
from apc.constants import MAKE_AP5C_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap5c",
        request,
        make_id=MAKE_AP5C_ID,
        process=process_request,
        skip_message="AP5C did not finalize an Instagram carousel",
        ok_message="AP5C finalized an Instagram carousel",
        dry_run_message="AP5C dry-run preview (no Airtable writes)",
    )
