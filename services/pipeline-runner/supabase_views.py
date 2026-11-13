"""Snapshotted Airtable view filters for runner Output and Content lists.

Only views whose filters use stored columns are included. A view that depends
on an Airtable formula field stays on Airtable. An unknown view stays on Airtable.
Record deletion is not started. Airtable is a frozen archive.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from supabase_formula import _blank_filter, _field_ref, _join_filters, _literal_filter, _nonempty_filter
from supabase_pipeline import OUTPUT_JSON_COLUMNS

_CHICAGO = ZoneInfo("America/Chicago")
_UTC = ZoneInfo("UTC")

_LINKS = {
    PLATFORM_OUTPUTS_TABLE: {
        "Content_Item": "content_item_id",
        "Content_Profile": "content_profile_id",
    },
    CONTENT_ITEMS_TABLE: {
        "Content_Profile": "content_profile_id",
        "Production_Request": "production_request_id",
    },
}

_VIEW_IDS = {
    "viwwnVJVPqfy7iYJK": "P3 - Ready for Platform Outputs",
}

_VIEWS = json.loads(Path(__file__).with_name("supabase_runner_views.json").read_text(encoding="utf-8"))


def _ref(table_id: str, node: dict) -> str | None:
    field = str(node.get("field") or "")
    kind = str(node.get("type") or "")
    if kind == "multipleRecordLinks":
        linked = _LINKS.get(table_id, {}).get(field)
        if linked:
            return linked
        if table_id == CONTENT_ITEMS_TABLE:
            return _field_ref(table_id, field)
        return None
    if table_id == PLATFORM_OUTPUTS_TABLE and field in OUTPUT_JSON_COLUMNS:
        return OUTPUT_JSON_COLUMNS[field]
    return _field_ref(table_id, field)


def _json_column(table_id: str, field: str) -> bool:
    return table_id == PLATFORM_OUTPUTS_TABLE and field in OUTPUT_JSON_COLUMNS


def _next_chicago_midnight(now: datetime | None) -> str:
    current = now or datetime.now(_CHICAGO)
    if current.tzinfo is None:
        current = current.replace(tzinfo=_CHICAGO)
    else:
        current = current.astimezone(_CHICAGO)
    start = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start.astimezone(_UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _values(node: dict) -> list:
    value = node.get("value")
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _safe_tokens(values: list) -> bool:
    return bool(values) and all(not any(ch in str(item) for ch in ',()"') for item in values)


def _node(table_id: str, node: dict, now: datetime | None) -> str | None:
    op = str(node.get("op") or "")
    if op in {"and", "or"}:
        parts = []
        for arg in node.get("args") or []:
            item = _node(table_id, arg, now)
            if item is None:
                return None
            parts.append(item)
        if not parts:
            return None
        if len(parts) == 1:
            return parts[0]
        return _join_filters(op, parts)
    ref = _ref(table_id, node)
    if not ref:
        return None
    field = str(node.get("field") or "")
    kind = str(node.get("type") or "")
    if op == "isEmpty":
        if _json_column(table_id, field):
            return f"or({ref}.is.null,{ref}.eq.[])"
        if kind == "number":
            return f"{ref}.is.null"
        return _blank_filter(ref)
    if op == "isNotEmpty":
        if _json_column(table_id, field):
            return f"and({ref}.not.is.null,{ref}.neq.[])"
        if kind == "number":
            return f"{ref}.not.is.null"
        return _nonempty_filter(ref)
    if op == "=":
        value = node.get("value")
        if kind == "checkbox":
            if value is True:
                return f"{ref}.eq.true"
            return f"or({ref}.is.null,{ref}.eq.false)"
        return _literal_filter(ref, "eq", str(value))
    if op == "isAnyOf":
        values = [str(item) for item in _values(node)]
        if not _safe_tokens(values):
            return None
        if len(values) == 1:
            return _literal_filter(ref, "eq", values[0])
        return ref + ".in.(" + ",".join(values) + ")"
    if op == "isNoneOf":
        values = [str(item) for item in _values(node)]
        if not _safe_tokens(values):
            return None
        return ref + ".not.in.(" + ",".join(values) + ")"
    if op == "<":
        return f"{ref}.lt.{node.get('value')}"
    if op == ">":
        return f"{ref}.gt.{node.get('value')}"
    if op == "<=":
        value = node.get("value")
        if isinstance(value, dict) and value.get("mode") == "today":
            return f"{ref}.lt.{_next_chicago_midnight(now)}"
        return f"{ref}.lte.{value}"
    if op == "contains":
        needle = str(node.get("value") or "")
        if not needle or any(ch in needle for ch in ',()*"'):
            return None
        return f"{ref}.ilike.*{needle}*"
    return None


def view_to_postgrest_filter(table_id: str, view: str | None, *, now: datetime | None = None) -> str | None:
    """PostgREST filter for a snapshotted view, or None when the view stays on Airtable."""
    if not view:
        return ""
    if table_id not in (PLATFORM_OUTPUTS_TABLE, CONTENT_ITEMS_TABLE):
        return None
    name = _VIEW_IDS.get(view, view)
    tree = _VIEWS.get(name)
    if tree is None:
        return None
    return _node(table_id, tree, now)
