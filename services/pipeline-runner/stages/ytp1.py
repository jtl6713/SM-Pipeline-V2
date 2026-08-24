from __future__ import annotations

from config import StageRequest
from stages._yt import run_youtube_stage
from yt.constants import MAKE_YTP1_ID
from yt.ytp1 import process_request


def run(request: StageRequest):
    return run_youtube_stage(
        "ytp1",
        request,
        make_id=MAKE_YTP1_ID,
        process=process_request,
        skip_message="YTP1 did not start a YouTube upload",
        ok_message="YTP1 queued YouTube upload {job_id}",
        dry_run_message="YTP1 dry-run preview (no upload or Airtable writes)",
    )
