from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from orch.constants import MAKE_IG_ORCH_ID
from orch.processor import process_igrs
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "publish_igrs",
        request,
        make_id=MAKE_IG_ORCH_ID,
        process=process_igrs,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="IG-PUB-ORCH did not dispatch an Instagram Reel or Story stage",
        ok_message="IG-PUB-ORCH dispatched {dispatched_count} Instagram Reel or Story stages",
        dry_run_message="IG-PUB-ORCH dry-run preview (no stage writes)",
    )
