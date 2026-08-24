from __future__ import annotations

from config import StageRequest
from stages._ttd import run_tiktok_stage
from ttd.constants import MAKE_TTD3_ID
from ttd.ttd3 import process_request


def run(request: StageRequest):
    return run_tiktok_stage(
        "ttd3",
        request,
        make_id=MAKE_TTD3_ID,
        process=process_request,
        skip_message="TTD3 did not send a TikTok draft handoff email",
        ok_message="TTD3 sent TikTok draft handoff email",
        dry_run_message="TTD3 dry-run preview (no Airtable writes)",
    )
