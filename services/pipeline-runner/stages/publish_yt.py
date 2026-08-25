from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from orch.constants import MAKE_YT_ORCH_ID
from orch.processor import process_yt
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "publish_yt",
        request,
        make_id=MAKE_YT_ORCH_ID,
        process=process_yt,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="YT-ORCH did not dispatch a YouTube stage",
        ok_message="YT-ORCH dispatched {dispatched_count} YouTube stages",
        dry_run_message="YT-ORCH dry-run preview (no stage writes)",
    )
