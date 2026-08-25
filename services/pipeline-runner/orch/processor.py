"""Publish orchestrators — dispatch due outputs to the matching Python stage (Make ORCHs)."""

from __future__ import annotations

import importlib
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from item4.settings import pipeline_settings
from orch.constants import (
    IGPUB_PROMOTE_NOTE,
    MAKE_APCAR_ORCH_ID,
    MAKE_APCAR_ORCH_NAME,
    MAKE_FB_ORCH_ID,
    MAKE_FB_ORCH_NAME,
    MAKE_IG_ORCH_ID,
    MAKE_IG_ORCH_NAME,
    MAKE_TTD_ORCH_ID,
    MAKE_TTD_ORCH_NAME,
    MAKE_YT_ORCH_ID,
    MAKE_YT_ORCH_NAME,
)
from orch.formulas import APCAR_BRANCHES, FB_BRANCHES, IGPUB_BRANCHES, OrchBranch, TTD_BRANCHES, YT_BRANCHES
from render.fields import field_str

_STAGE_MODULES = {
    "ap0": "ap0.processor",
    "ap1_ig": "ap1_ig.processor",
    "ap1_igs": "ap1_igs.processor",
    "ap1_igs_poll": "ap1_igs.poll",
    "ttd0": "ttd.ttd0",
    "ttd1": "ttd.ttd1",
    "ttd2": "ttd.ttd2",
    "ttd3": "ttd.ttd3",
    "yt0": "yt.yt0",
    "ytp1": "yt.ytp1",
    "yts1": "yt.yts1",
    "yts2": "yt.yts2",
    "yts3": "yt.yts3",
    "fb0": "fb.fb0",
    "fb1": "fb.fb1",
    "fb2": "fb.fb2",
    "fb2r": "fb.fb2r",
    "fb3": "fb.fb3",
    "fbs1": "fbs1.processor",
    "fbs2": "fbs1.poll",
    "fbs3": "fbs3.processor",
    "fbs4": "fbs3.poll",
    "ap0c": "apc.ap0c",
    "ap1c": "apc.ap1c",
    "ap2c": "apc.ap2c",
    "ap3c": "apc.ap3c",
    "ap3p": "apc.ap3p",
    "ap4c": "apc.ap4c",
    "ap4r": "apc.ap4r",
    "ap5c": "apc.ap5c",
}


def _process(stage: str):
    return importlib.import_module(_STAGE_MODULES[stage]).process_request


def _dispatch(stage: str, record: dict[str, Any], *, dry_run: bool) -> dict[str, Any]:
    kwargs = {
        "output_record_id": record["id"],
        "test_run_id": field_str(record, "Test_Run_ID") or None,
        "dry_run": dry_run,
    }
    extra = {
        "replace_transaction_id": field_str(record, "Replace_Transaction_ID") or None,
        "replace_fingerprint": field_str(record, "Replace_Fingerprint") or None,
    }
    process = _process(stage)
    try:
        return process(**kwargs, **extra)
    except TypeError:
        return process(**kwargs)


def run_tick(
    *,
    branches: tuple[OrchBranch, ...],
    make_id: int,
    make_name: str,
    source: str,
    dry_run: bool = False,
    require_youtube_enabled: bool = False,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": make_id,
        "make_scenario_name": make_name,
        "source": source,
    }
    client = AirtableClient()
    if require_youtube_enabled:
        enabled = str(pipeline_settings(client).get("YOUTUBE_ENABLED") or "").strip().lower()
        if enabled != "true":
            return {"processed": False, "reason": "youtube_disabled", "dispatched_count": 0, **preview}

    runs: list[dict[str, Any]] = []
    dispatched = 0
    for branch in branches:
        rows = client.list_records(
            PLATFORM_OUTPUTS_TABLE,
            view=branch.view,
            formula=branch.formula,
            max_records=1,
        )
        if not rows:
            runs.append({"branch": branch.name, "stage": branch.stage, "matched": False})
            continue
        record = rows[0]
        hit = {
            "branch": branch.name,
            "stage": branch.stage,
            "matched": True,
            "output_record_id": record["id"],
            "output_id": field_str(record, "Output_ID"),
        }
        if branch.action == "promote":
            if dry_run:
                runs.append({**hit, "dry_run": True, "action": "promote"})
                dispatched += 1
                continue
            existing = field_str(record, "Output_Notes")
            notes = f"{existing}\n\n{IGPUB_PROMOTE_NOTE}" if existing else IGPUB_PROMOTE_NOTE
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                record["id"],
                {"Publish_Status": "Ready to Publish", "Output_Notes": notes},
                typecast=True,
            )
            runs.append({**hit, "action": "promote", "result": {"processed": True}})
            dispatched += 1
            continue
        if dry_run:
            runs.append({**hit, "dry_run": True})
            dispatched += 1
            continue
        result = _dispatch(branch.stage, record, dry_run=False)
        runs.append({**hit, "result": result})
        if result.get("processed"):
            dispatched += 1
    preview["runs"] = runs
    preview["dispatched_count"] = dispatched
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if not dispatched:
        return {"processed": False, "reason": "no_due_branches", **preview}
    return {"processed": True, **preview}


def process_ttd(*, dry_run: bool = False) -> dict[str, Any]:
    return run_tick(
        branches=TTD_BRANCHES,
        make_id=MAKE_TTD_ORCH_ID,
        make_name=MAKE_TTD_ORCH_NAME,
        source="TTD-ORCH",
        dry_run=dry_run,
    )


def process_yt(*, dry_run: bool = False) -> dict[str, Any]:
    return run_tick(
        branches=YT_BRANCHES,
        make_id=MAKE_YT_ORCH_ID,
        make_name=MAKE_YT_ORCH_NAME,
        source="YT-ORCH",
        dry_run=dry_run,
        require_youtube_enabled=True,
    )


def process_fb(*, dry_run: bool = False) -> dict[str, Any]:
    return run_tick(
        branches=FB_BRANCHES,
        make_id=MAKE_FB_ORCH_ID,
        make_name=MAKE_FB_ORCH_NAME,
        source="FB-ORCH",
        dry_run=dry_run,
    )


def process_apcar(*, dry_run: bool = False) -> dict[str, Any]:
    return run_tick(
        branches=APCAR_BRANCHES,
        make_id=MAKE_APCAR_ORCH_ID,
        make_name=MAKE_APCAR_ORCH_NAME,
        source="AP-CAR-ORCH",
        dry_run=dry_run,
    )


def process_igrs(*, dry_run: bool = False) -> dict[str, Any]:
    return run_tick(
        branches=IGPUB_BRANCHES,
        make_id=MAKE_IG_ORCH_ID,
        make_name=MAKE_IG_ORCH_NAME,
        source="IG-PUB-ORCH",
        dry_run=dry_run,
    )
