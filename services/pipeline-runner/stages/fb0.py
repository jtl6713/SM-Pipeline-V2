from __future__ import annotations

from config import StageRequest
from fb.constants import MAKE_FB0_ID
from fb.fb0 import process_request
from stages._fb import run_facebook_photo_stage


def run(request: StageRequest):
    return run_facebook_photo_stage(
        "fb0",
        request,
        make_id=MAKE_FB0_ID,
        process=process_request,
        skip_message="FB0 did not prepare a Facebook photo asset set",
        ok_message="FB0 prepared Facebook photo assets",
        dry_run_message="FB0 dry-run preview (no Airtable writes)",
    )
