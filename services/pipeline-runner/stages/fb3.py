from __future__ import annotations

from config import StageRequest
from fb.constants import MAKE_FB3_ID
from fb.fb3 import process_request
from stages._fb import run_facebook_photo_stage


def run(request: StageRequest):
    return run_facebook_photo_stage(
        "fb3",
        request,
        make_id=MAKE_FB3_ID,
        process=process_request,
        skip_message="FB3 did not finalize a Facebook Page post",
        ok_message="FB3 finalized a Facebook Page post",
        dry_run_message="FB3 dry-run preview (no Airtable or Graph writes)",
    )
