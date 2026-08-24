from __future__ import annotations

from apc.ap3p import process_request
from apc.constants import MAKE_AP3P_ID
from config import StageRequest
from stages._apc import run_instagram_carousel_stage


def run(request: StageRequest):
    return run_instagram_carousel_stage(
        "ap3p",
        request,
        make_id=MAKE_AP3P_ID,
        process=process_request,
        skip_message="AP3P did not poll the Instagram carousel parent container",
        ok_message="AP3P polled the Instagram carousel parent container",
        dry_run_message="AP3P dry-run preview (no Airtable writes)",
    )
