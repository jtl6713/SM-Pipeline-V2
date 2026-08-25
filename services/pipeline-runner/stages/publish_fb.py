from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from orch.constants import MAKE_FB_ORCH_ID
from orch.processor import process_fb
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "publish_fb",
        request,
        make_id=MAKE_FB_ORCH_ID,
        process=process_fb,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="FB-ORCH did not dispatch a Facebook stage",
        ok_message="FB-ORCH dispatched {dispatched_count} Facebook stages",
        dry_run_message="FB-ORCH dry-run preview (no stage writes)",
    )
