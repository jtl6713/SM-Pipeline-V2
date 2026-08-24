from __future__ import annotations

from config import StageRequest
from stages._ttd import run_tiktok_stage
from ttd.constants import MAKE_TTD1_ID
from ttd.ttd1 import process_request


def run(request: StageRequest):
    return run_tiktok_stage(
        "ttd1",
        request,
        make_id=MAKE_TTD1_ID,
        process=process_request,
        skip_message="TTD1 did not initialize a TikTok draft",
        ok_message="TTD1 initialized TikTok draft",
        dry_run_message="TTD1 dry-run preview (no Airtable writes)",
    )
