from __future__ import annotations

from sai1.constants import MAKE_SCENARIO_ID
from sai1.processor import process_request
from stages._carousel import run_named_stage
from config import StageRequest, StageResult


def run(request: StageRequest) -> StageResult:
    needed = request.extra.get("needed")
    total = request.extra.get("total")
    try:
        needed_int = int(needed) if needed is not None else 0
    except (TypeError, ValueError):
        needed_int = 0
    try:
        total_int = int(total) if total is not None else None
    except (TypeError, ValueError):
        total_int = None
    return run_named_stage(
        "sai1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "title": str(request.extra.get("title") or "").strip(),
            "market": str(request.extra.get("market") or "Chicago").strip() or "Chicago",
            "covered_text": str(request.extra.get("covered_text") or "(none)"),
            "needed": needed_int,
            "total": total_int,
            "dry_run": bool(request.extra.get("dry_run")),
        },
        skip_message="SAI1 did not return slide themes",
        ok_message="SAI1 returned {needed} themed slide(s)",
        dry_run_message="SAI1 dry-run preview (no OpenAI call)",
    )
