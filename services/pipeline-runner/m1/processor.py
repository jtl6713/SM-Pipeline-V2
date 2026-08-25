"""M1 processor — reset Rendering jobs that still point at an obsolete Remotion URL (Make 5569896)."""

from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from m1.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME, M1_MAX_RECORDS, M1_RESET_NOTE
from m1.eligibility import stale_render_formula
from render.fields import field_str
from render.settings import get_render_server_url


def _health_ok(base_url: str) -> tuple[bool, int | None]:
    try:
        response = requests.get(f"{base_url.rstrip('/')}/health", timeout=15)
        return response.status_code == 200, response.status_code
    except requests.RequestException:
        return False, None


def _reset_fields(base_url: str) -> dict[str, Any]:
    return {
        "Render_Status": "Ready for Render",
        "Remotion_Job_ID": "",
        "Remotion_Status_URL": "",
        "Render_Server_URL": "",
        "Remotion_Props_JSON": "",
        "Final_File_Storage_Status": "",
        "Final_File_Error_Message": "",
        "Remotion_Error_Message": M1_RESET_NOTE.format(base_url=base_url),
    }


def process_request(*, dry_run: bool = False) -> dict[str, Any]:
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
    }
    client = AirtableClient()
    base_url = get_render_server_url(client)
    preview["render_server_url"] = base_url
    if not base_url:
        return {"processed": False, "reason": "missing_render_server_url", "reset_count": 0, **preview}

    healthy, status_code = _health_ok(base_url)
    preview["health_status_code"] = status_code
    if not healthy:
        return {"processed": False, "reason": "render_server_unhealthy", "reset_count": 0, **preview}

    rows = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=stale_render_formula(base_url),
        max_records=M1_MAX_RECORDS,
    )
    preview["matched_ids"] = [row["id"] for row in rows]
    preview["matched_count"] = len(rows)
    if dry_run:
        return {"processed": False, "dry_run": True, "reset_count": 0, **preview}
    if not rows:
        return {"processed": False, "reason": "no_stale_jobs", "reset_count": 0, **preview}

    reset_ids: list[str] = []
    fields = _reset_fields(base_url)
    for row in rows:
        client.update_record(PLATFORM_OUTPUTS_TABLE, row["id"], fields, typecast=True)
        reset_ids.append(row["id"])
        preview.setdefault("output_ids", []).append(field_str(row, "Output_ID"))
    return {"processed": True, "reset_count": len(reset_ids), "reset_ids": reset_ids, **preview}
