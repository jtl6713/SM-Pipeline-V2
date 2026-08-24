from __future__ import annotations

from config import StageRequest
from stages._yt import run_youtube_stage
from yt.constants import MAKE_YTS3_ID
from yt.yts3 import process_request


def run(request: StageRequest):
    return run_youtube_stage(
        "yts3",
        request,
        make_id=MAKE_YTS3_ID,
        process=process_request,
        skip_message="YTS3 did not finalize a YouTube publish",
        ok_message="YTS3 finalized YouTube video {video_id}",
        dry_run_message="YTS3 dry-run preview (no Airtable writes)",
    )
