from __future__ import annotations

from its1.constants import MAKE_SCENARIO_ID
from its1.processor import process_request
from stages._carousel import run_named_stage
from config import StageRequest, StageResult


def run(request: StageRequest) -> StageResult:
    extra = request.extra or {}
    catalog = extra.get("catalog")
    if not isinstance(catalog, list):
        catalog = extra.get("stills") if isinstance(extra.get("stills"), list) else []
    return run_named_stage(
        "its1",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs={
            "title": str(extra.get("title") or "").strip(),
            "summary": str(extra.get("summary") or "").strip(),
            "location": str(extra.get("location") or extra.get("primary_location") or "").strip(),
            "market": str(extra.get("market") or "Chicago").strip() or "Chicago",
            "catalog": catalog,
            "dry_run": bool(extra.get("dry_run")),
        },
        skip_message="ITS1 did not return a timed script",
        ok_message="ITS1 wrote a timed script from {catalog_count} library stills",
        dry_run_message="ITS1 dry-run preview (no OpenAI call)",
    )
