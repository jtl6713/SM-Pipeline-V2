"""Start IG/FB/TikTok publisher cadence after RR2 approve (Make modules 91–95)."""

from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from render.fields import field_str
from rr2.constants import PUBLISHER_START_SCENARIOS

MAKE_API_SETTINGS_FORMULA = (
    'AND({Active}=1,OR({Setting_Name}="MAKE_API_BASE_URL",{Setting_Name}="MAKE_API_TOKEN"))'
)


def load_make_api_settings(client: AirtableClient) -> tuple[str, str]:
    rows = client.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula=MAKE_API_SETTINGS_FORMULA,
        max_records=2,
    )
    values: dict[str, str] = {}
    for row in rows:
        name = field_str(row, "Setting_Name")
        if name:
            values[name] = field_str(row, "Setting_Value")
    return values.get("MAKE_API_BASE_URL", "").rstrip("/"), values.get("MAKE_API_TOKEN", "")


def start_publisher_cadence(client: AirtableClient | None = None) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    try:
        client = client or AirtableClient()
        base, token = load_make_api_settings(client)
        if not base or not token:
            return [{"skipped": "missing_make_api_settings"}]
        headers = {
            "Authorization": f"Token {token}",
            "Content-Type": "application/json",
        }
        for scenario_id, name in PUBLISHER_START_SCENARIOS:
            try:
                response = requests.post(
                    f"{base}/scenarios/{scenario_id}/start",
                    headers=headers,
                    json={},
                    timeout=30,
                )
                results.append(
                    {
                        "scenario_id": scenario_id,
                        "name": name,
                        "status_code": response.status_code,
                    }
                )
            except Exception as exc:
                results.append(
                    {
                        "scenario_id": scenario_id,
                        "name": name,
                        "error": str(exc),
                    }
                )
    except Exception as exc:
        results.append({"error": str(exc)})
    return results
