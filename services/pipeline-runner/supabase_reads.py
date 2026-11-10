"""Phase 5 remainder: optional runner reads of Platform Outputs and Content Items.

Airtable stays the default. Each table has its own flag, so a global
STUDIO_READ_SOURCE value cannot turn both on. STUDIO_WRITE_SOURCE does not
turn these reads on. A formula, a view, an unmapped sort, or an unmapped
requested field stays on Airtable. A Supabase error falls back to Airtable.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from supabase_pipeline import CONTENT_PATCH_COLUMNS, OUTPUT_PATCH_COLUMNS, _rest, supabase_configured

logger = logging.getLogger("pipeline-runner.supabase-reads")

_OUTPUT_FIELDS = {**OUTPUT_PATCH_COLUMNS, "Do_Not_Publish": "do_not_publish"}
_CONTENT_FIELDS = dict(CONTENT_PATCH_COLUMNS)


def runner_table_read_source(settings: dict | None, table_id: str) -> str:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        key = "studio_runner_output_read_source"
    elif table_id == CONTENT_ITEMS_TABLE:
        key = "studio_runner_content_read_source"
    else:
        return "airtable"
    raw = str((settings or {}).get(key) or "airtable").strip().lower()
    if raw == "supabase" and supabase_configured(settings):
        return "supabase"
    return "airtable"


def _columns_for(table_id: str) -> dict[str, str]:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return _OUTPUT_FIELDS
    if table_id == CONTENT_ITEMS_TABLE:
        return _CONTENT_FIELDS
    return {}


def _supabase_table(table_id: str) -> str:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return "platform_outputs"
    return "content_items"


def _shaped(row: dict, columns: dict[str, str], requested: list[str] | None) -> dict | None:
    record_id = str(row.get("airtable_record_id") or "").strip()
    if not record_id:
        return None
    wanted = set(requested) if requested else None
    fields: dict[str, Any] = {}
    for airtable_key, column in columns.items():
        if wanted is not None and airtable_key not in wanted:
            continue
        if column not in row or row.get(column) is None:
            continue
        value = row.get(column)
        if airtable_key == "Do_Not_Publish":
            value = bool(value)
        fields[airtable_key] = value
    return {"id": record_id, "fields": fields}


def try_list_supabase_records(
    settings: dict | None,
    table_id: str,
    *,
    formula: str | None = None,
    view: str | None = None,
    max_records: int = 10,
    fields: list[str] | None = None,
    sort_field: str | None = None,
    sort_direction: str = "asc",
) -> list[dict] | None:
    """Airtable-shaped rows, or None when this call must use Airtable."""
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    if formula or view:
        return None
    columns = _columns_for(table_id)
    if not columns:
        return None
    if fields and any(name not in columns for name in fields):
        return None
    order_column = "airtable_record_id"
    if sort_field:
        order_column = columns.get(sort_field) or ""
        if not order_column:
            return None
    direction = "desc" if str(sort_direction or "").lower() == "desc" else "asc"
    limit = max(1, min(int(max_records or 10), 100))
    select = ",".join(["airtable_record_id", *dict.fromkeys(columns.values())])
    path = (
        f"{_supabase_table(table_id)}?select={quote(select, safe=',')}"
        f"&order={quote(order_column, safe='')}.{direction}&limit={limit}"
    )
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase runner read failed for %s; using Airtable: %s", table_id, error)
        return None
    if not isinstance(payload, list):
        return None
    records = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        shaped = _shaped(row, columns, fields)
        if shaped:
            records.append(shaped)
    return records[:limit]
