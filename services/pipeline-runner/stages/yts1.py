from __future__ import annotations

from config import StageRequest
from stages._yt import run_youtube_stage
from yt.constants import MAKE_YTS1_ID
from yt.yts1 import process_request


def run(request: StageRequest):
    return run_youtube_stage(
        "yts1",
        request,
        make_id=MAKE_YTS1_ID,
        process=process_request,
        skip_message="YTS1 did not poll a YouTube upload job",
        ok_message="YTS1 polled YouTube upload job",
        dry_run_message="YTS1 dry-run preview (no uploader poll or Airtable writes)",
    )
