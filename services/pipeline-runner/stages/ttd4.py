from __future__ import annotations

from config import StageRequest
from stages._ttd import run_tiktok_stage
from ttd.constants import MAKE_TTD4_ID
from ttd.ttd4 import process_request


def run(request: StageRequest):
    return run_tiktok_stage(
        "ttd4",
        request,
        make_id=MAKE_TTD4_ID,
        process=process_request,
        skip_message="TTD4 did not complete TikTok manual publishing",
        ok_message="TTD4 handled TikTok manual completion",
        dry_run_message="TTD4 dry-run preview (no Airtable writes)",
        extra_keys=("action", "token", "platform_post_url", "music_completed", "form_url"),
    )
