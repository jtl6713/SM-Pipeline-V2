"""Start IG/FB/TikTok publisher cadence after RR2 approve (Make modules 91–95)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from render.fields import field_str
from rr2.constants import PUBLISHER_START_SCENARIOS

ORCH_BACKEND_BY_SCENARIO = {
    5864632: "stage_backend_ig_orch",
    5813561: "stage_backend_fb_orch",
    5806668: "stage_backend_ttd_orch",
}


def orch_make_start_skipped(scenario_id: int, settings: dict | None = None) -> bool:
    return True

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


def start_publisher_cadence(_client: AirtableClient | None = None) -> list[dict[str, Any]]:
    return [
        {"scenario_id": scenario_id, "name": name, "skipped": "python"}
        for scenario_id, name in PUBLISHER_START_SCENARIOS
    ]
