from __future__ import annotations

from config import StageRequest
from stages._ttd import run_tiktok_stage
from ttd.constants import MAKE_TTD0_ID
from ttd.ttd0 import process_request


def run(request: StageRequest):
    return run_tiktok_stage(
        "ttd0",
        request,
        make_id=MAKE_TTD0_ID,
        process=process_request,
        skip_message="TTD0 did not prepare a TikTok draft asset set",
        ok_message="TTD0 prepared TikTok draft assets",
        dry_run_message="TTD0 dry-run preview (no Airtable writes)",
    )
