from __future__ import annotations

from config import StageRequest
from stages._ttd import run_tiktok_stage
from ttd.constants import MAKE_TTD2_ID
from ttd.ttd2 import process_request


def run(request: StageRequest):
    return run_tiktok_stage(
        "ttd2",
        request,
        make_id=MAKE_TTD2_ID,
        process=process_request,
        skip_message="TTD2 did not poll TikTok draft processing",
        ok_message="TTD2 polled TikTok draft processing",
        dry_run_message="TTD2 dry-run preview (no Airtable writes)",
    )
