from __future__ import annotations

from config import StageRequest
from stages._yt import run_youtube_stage
from yt.constants import MAKE_YTS2_ID
from yt.yts2 import process_request


def run(request: StageRequest):
    return run_youtube_stage(
        "yts2",
        request,
        make_id=MAKE_YTS2_ID,
        process=process_request,
        skip_message="YTS2 did not poll YouTube processing",
        ok_message="YTS2 polled YouTube processing",
        dry_run_message="YTS2 dry-run preview (no processing poll or Airtable writes)",
    )
