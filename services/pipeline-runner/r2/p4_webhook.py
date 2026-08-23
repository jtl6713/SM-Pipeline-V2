"""P4 missing-asset webhook — Make modules 20/21."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from config import load_settings
from r2.constants import P4_WEBHOOK_URL


def _field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def trigger_p4(output: dict[str, Any], *, reason: str, source: str = "R2 python scaffold") -> dict[str, Any]:
    settings = load_settings()
    url = str(settings.get("p4_webhook_url") or P4_WEBHOOK_URL).strip()
    payload = {
        "source": source,
        "reason": reason,
        "output_id": _field(output, "Output_ID"),
        "requested_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "test_run_id": _field(output, "Test_Run_ID") or "",
    }
    response = requests.post(url, json=payload, timeout=40)
    response.raise_for_status()
    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text[:500]}
    return {"url": url, "status_code": response.status_code, "body": body}
