from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from orch.constants import MAKE_TTD_ORCH_ID
from orch.processor import process_ttd
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "publish_tt",
        request,
        make_id=MAKE_TTD_ORCH_ID,
        process=process_ttd,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="TTD-ORCH did not dispatch a TikTok draft stage",
        ok_message="TTD-ORCH dispatched {dispatched_count} TikTok draft stages",
        dry_run_message="TTD-ORCH dry-run preview (no stage writes)",
    )
