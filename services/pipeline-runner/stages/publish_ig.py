from __future__ import annotations

from asset.helpers import as_bool
from config import StageRequest
from orch.constants import MAKE_APCAR_ORCH_ID
from orch.processor import process_apcar
from stages._carousel import run_named_stage


def run(request: StageRequest):
    extra = request.extra or {}
    return run_named_stage(
        "publish_ig",
        request,
        make_id=MAKE_APCAR_ORCH_ID,
        process=process_apcar,
        kwargs={"dry_run": as_bool(extra.get("dry_run"))},
        skip_message="AP-CAR-ORCH did not dispatch an Instagram carousel stage",
        ok_message="AP-CAR-ORCH dispatched {dispatched_count} Instagram carousel stages",
        dry_run_message="AP-CAR-ORCH dry-run preview (no stage writes)",
    )
