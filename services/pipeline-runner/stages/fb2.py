from __future__ import annotations

from config import StageRequest
from fb.constants import MAKE_FB2_ID
from fb.fb2 import process_request
from stages._fb import run_facebook_photo_stage


def run(request: StageRequest):
    return run_facebook_photo_stage(
        "fb2",
        request,
        make_id=MAKE_FB2_ID,
        process=process_request,
        skip_message="FB2 did not publish a Facebook Page photo post",
        ok_message="FB2 published a Facebook Page photo post",
        dry_run_message="FB2 dry-run preview (no Airtable or Graph writes)",
    )
