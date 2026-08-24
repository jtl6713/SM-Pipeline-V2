from __future__ import annotations

from config import StageRequest
from stages._yt import run_youtube_stage
from yt.constants import MAKE_YT0_ID
from yt.yt0 import process_request


def run(request: StageRequest):
    return run_youtube_stage(
        "yt0",
        request,
        make_id=MAKE_YT0_ID,
        process=process_request,
        skip_message="YT0 did not prepare a YouTube package",
        ok_message="YT0 prepared YouTube package",
        dry_run_message="YT0 dry-run preview (no Airtable writes)",
    )
