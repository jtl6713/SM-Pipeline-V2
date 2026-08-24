from __future__ import annotations

from config import StageRequest
from fb.constants import MAKE_FB2R_ID
from fb.fb2r import process_request
from stages._fb import run_facebook_photo_stage


def run(request: StageRequest):
    return run_facebook_photo_stage(
        "fb2r",
        request,
        make_id=MAKE_FB2R_ID,
        process=process_request,
        skip_message="FB2R did not reconcile a Facebook Page publish",
        ok_message="FB2R reconciled a Facebook Page publish",
        dry_run_message="FB2R dry-run preview (no Airtable or Graph writes)",
    )
