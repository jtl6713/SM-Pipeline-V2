from __future__ import annotations

from config import StageRequest
from fb.constants import MAKE_FB1_ID
from fb.fb1 import process_request
from stages._fb import run_facebook_photo_stage


def run(request: StageRequest):
    return run_facebook_photo_stage(
        "fb1",
        request,
        make_id=MAKE_FB1_ID,
        process=process_request,
        skip_message="FB1 did not create Facebook photo media",
        ok_message="FB1 created Facebook photo media",
        dry_run_message="FB1 dry-run preview (no Airtable or Graph writes)",
    )
