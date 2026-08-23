"""P3 processor scaffold — multi-route blueprint; port after P2."""

from __future__ import annotations

from typing import Any

from p3.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME


def process_request(
    *,
    content_item_record_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    return {
        "processed": False,
        "status": "deferred",
        "make_fallback_required": True,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "reason": "p3_not_implemented_use_make_webhook",
        "content_item_record_id": content_item_record_id,
        "dry_run": dry_run,
    }
