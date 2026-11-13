"""Phase 5 remainder: optional runner reads of Platform Outputs and Content Items.

Airtable stays the default. Each table has its own flag, so a global
STUDIO_READ_SOURCE value cannot turn both on. STUDIO_WRITE_SOURCE does not
turn these reads on. Allowlisted formulas translate to PostgREST filters;
views and FIND/ARRAYJOIN that are not a stored-column view or a text/link
lookup stay on Airtable. OR of allowlisted predicates is translated. Three
Studio produce Platform Output link lookups are the FIND exception, including
inside AND. OR of a link lookup stays on Airtable. A substring FIND on a JSON
column stays on Airtable.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter
from supabase_views import view_to_postgrest_filter
from supabase_pipeline import (
    CONTENT_PATCH_COLUMNS,
    OUTPUT_JSON_COLUMNS,
    OUTPUT_PATCH_COLUMNS,
    _rest,
    supabase_configured,
)

logger = logging.getLogger("pipeline-runner.supabase-reads")

# Empty lists and unmarked rows fall back to Airtable unless a table is listed
# here. A table belongs here only when its Airtable count equals its Supabase
# count and every Supabase row carries the runner marker. Compared 2026-11-12:
# outputs 9208 vs 9916 (685 marked), content 1897 vs 1971 (212 marked),
# requests 2035 vs 1362, media 22059 vs 22037, queue 18619 vs 1040.
# None qualified, so this set stays empty and the fallback stays on.
FALLBACK_STOPPED_TABLES: frozenset[str] = frozenset()

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
    from settings_store import list_settings

    try:
        stored_settings = list_settings(settings, table_id, formula, max_records)
    except Exception as error:
        logger.warning("supabase settings read failed for %s; using Airtable: %s", table_id, error)
        stored_settings = None
    if stored_settings is not None:
        return stored_settings
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    # Unknown views and views that use an Airtable formula field stay on Airtable.
    # A snapshotted view filter is combined with an allowlisted formula.
    view_filter = ""
    if view:
        view_filter = view_to_postgrest_filter(table_id, view)
        if view_filter is None:
            return None
    formula_filter = None
    if formula:
        formula_filter = formula_to_postgrest_filter(table_id, formula)
        if formula_filter is None:
            return None
    if view_filter and formula_filter:
        from supabase_formula import _join_filters

        formula_filter = _join_filters("and", [view_filter, formula_filter])
        if formula_filter is None:
            return None
    elif view_filter:
        formula_filter = view_filter
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
    select = _list_select(table_id)
    path = (
        f"{_supabase_table(table_id)}?select={quote(select, safe='(),*')}"
        f"&order={quote(order_column, safe='')}.{direction}&limit={limit}"
    )
    path = attach_formula_filter(path, formula_filter)
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase runner read failed for %s; using Airtable: %s", table_id, error)
        return None
    stopped = table_id in FALLBACK_STOPPED_TABLES
    if not isinstance(payload, list) or not payload:
        return [] if stopped else None
    records = []
    for row in payload:
        if not isinstance(row, dict):
            return None
        shaped = _record_from_row(row, table_id)
        # Unmarked rows are still valid when Supabase is the runner read
        # source. Skipping them forced Airtable fallback and hid Worker lean
        # stamps (TikTok_Draft_Publish_ID) after the archive freeze.
        # A table in FALLBACK_STOPPED_TABLES returns shaped rows only.
        if not shaped:
            continue
        if fields:
            shaped = {
                "id": shaped["id"],
                "fields": {key: value for key, value in shaped["fields"].items() if key in fields},
            }
        records.append(shaped)
    if not records:
        return [] if stopped else None
    return records[:limit]


def _list_select(table_id: str) -> str:
    columns = _columns_for(table_id)
    base = ",".join(["airtable_record_id", *dict.fromkeys(columns.values())])
    if table_id == PLATFORM_OUTPUTS_TABLE:
        blobs = ",".join(OUTPUT_JSON_COLUMNS.values())
        return (
            f"{base},error_messages,{blobs},"
            "content_items(airtable_record_id),content_profiles(airtable_record_id)"
        )
    return f"{base},extras,content_profiles(airtable_record_id)"


def _overlay_bag(fields: dict[str, Any], bag: dict) -> None:
    for key, value in bag.items():
        if not key or str(key).startswith("_") or value is None:
            continue
        fields[key] = value


def _linked(row: dict, key: str) -> str:
    value = row.get(key)
    if isinstance(value, dict):
        return str(value.get("airtable_record_id") or "").strip()
    return ""


def _record_from_row(row: dict, table_id: str) -> dict | None:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        bag = row.get("error_messages") if isinstance(row.get("error_messages"), dict) else {}
        columns = _OUTPUT_FIELDS
    elif table_id == CONTENT_ITEMS_TABLE:
        bag = row.get("extras") if isinstance(row.get("extras"), dict) else {}
        columns = _CONTENT_FIELDS
    else:
        return None
    # Full densify still stamps _runner_record_projection=v1. Rejecting
    # unmarked rows forced Airtable fallback; with runner output reads on
    # Supabase and Airtable archive writes frozen, that hid lean Worker
    # stamps (TikTok_Draft_Publish_ID only) and TTD2 never saw publish_id.
    shaped = _shaped(row, columns, None)
    if not shaped:
        return None
    _overlay_bag(shaped["fields"], bag)
    if table_id == PLATFORM_OUTPUTS_TABLE:
        for airtable_key, column in OUTPUT_JSON_COLUMNS.items():
            if row.get(column) is not None:
                shaped["fields"][airtable_key] = row.get(column)
        content_id = _linked(row, "content_items")
        profile_id = _linked(row, "content_profiles")
        if content_id:
            shaped["fields"]["Content_Item"] = [content_id]
        if profile_id:
            shaped["fields"]["Content_Profile"] = [profile_id]
        from publish_queue import apply_publish_queue_fields

        apply_publish_queue_fields(shaped["fields"])
    else:
        profile_id = _linked(row, "content_profiles")
        if profile_id:
            shaped["fields"]["Content_Profile"] = [profile_id]
    return shaped


def try_get_supabase_record(settings: dict | None, table_id: str, record_id: str) -> dict | None:
    """One Airtable-shaped record, or None when this call must use Airtable.

    Lean Worker stamps may omit _runner_record_projection; the bag and typed
    columns are still authoritative when this table's runner read source is
    Supabase. A missing row or a Supabase error stays on Airtable.
    """
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    record_id = str(record_id or "").strip()
    if not record_id:
        return None
    if table_id == PLATFORM_OUTPUTS_TABLE:
        select = "*,content_items(airtable_record_id),content_profiles(airtable_record_id)"
    elif table_id == CONTENT_ITEMS_TABLE:
        select = "*,content_profiles(airtable_record_id)"
    else:
        return None
    path = (
        f"{_supabase_table(table_id)}?airtable_record_id=eq.{quote(record_id, safe='')}"
        f"&select={quote(select, safe='(),*')}&limit=1"
    )
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase runner get failed for %s %s; using Airtable: %s", table_id, record_id, error)
        return None
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    return _record_from_row(payload[0], table_id)
