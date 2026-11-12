"""Pipeline and Engagement settings stored in engagement_settings.payload."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from airtable.constants import PIPELINE_SETTINGS_TABLE

ENGAGEMENT_SETTINGS_TABLE = "tblY1wDxmrf5khAYy"


def settings_source(table_id: str) -> str | None:
    if table_id == PIPELINE_SETTINGS_TABLE:
        return "pipeline"
    if table_id == ENGAGEMENT_SETTINGS_TABLE:
        return "engagement"
    return None


def _compact(formula: str) -> str:
    return re.sub(r"\s+", "", str(formula or ""))


def settings_filter(formula: str) -> dict | None:
    text = _compact(formula)
    named = re.fullmatch(r'\{Setting_Name\}="([^"]*)"', text)
    if named:
        return {"name": named.group(1), "active": False, "prefix": ""}
    active = re.fullmatch(r'AND\(\{Active\}=1,\{Setting_Name\}="([^"]*)"\)', text)
    if active:
        return {"name": active.group(1), "active": True, "prefix": ""}
    if text in {
        "AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)",
        'AND({Active}=1,FIND("A1_JOB_",{Setting_Name})=1)',
    }:
        return {"name": "", "active": True, "prefix": "A1_JOB_"}
    return None


def _active(value: Any) -> bool:
    return value is True or value == 1 or str(value or "").strip().lower() == "true"


def _shaped(row: dict) -> dict | None:
    record_id = str(row.get("airtable_record_id") or "").strip()
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    if not record_id:
        return None
    return {"id": record_id, "fields": dict(payload)}


def list_settings(settings: dict, table_id: str, formula: str | None, limit: int) -> list[dict] | None:
    from supabase_pipeline import _rest, studio_write_source, supabase_configured

    source = settings_source(table_id)
    if not source or studio_write_source(settings) != "supabase" or not supabase_configured(settings):
        return None
    parsed = settings_filter(formula or "")
    if parsed is None:
        return None
    parts = [f"payload->>source=eq.{source}", "select=airtable_record_id,payload", f"limit={max(1, min(int(limit or 10), 100))}"]
    if parsed["name"]:
        parts.append(f"payload->>Setting_Name=eq.{quote(parsed['name'], safe='')}")
    if parsed["prefix"]:
        parts.append(f"payload->>Setting_Name=like.{quote(parsed['prefix'], safe='')}*")
    rows = _rest(settings, "engagement_settings?" + "&".join(parts), "GET")
    if not isinstance(rows, list):
        return None
    records = []
    for row in rows:
        shaped = _shaped(row) if isinstance(row, dict) else None
        if not shaped:
            continue
        if parsed["active"] and not _active(shaped["fields"].get("Active")):
            continue
        records.append(shaped)
    return records or None


def get_setting(settings: dict, table_id: str, record_id: str) -> dict | None:
    from supabase_pipeline import _rest, studio_write_source, supabase_configured

    source = settings_source(table_id)
    if not source or studio_write_source(settings) != "supabase" or not supabase_configured(settings):
        return None
    rows = _rest(
        settings,
        f"engagement_settings?airtable_record_id=eq.{quote(record_id, safe='')}"
        f"&payload->>source=eq.{source}&select=airtable_record_id,payload&limit=1",
        "GET",
    )
    if not isinstance(rows, list) or not rows:
        return None
    return _shaped(rows[0])


def commit_setting(settings: dict, table_id: str, record_id: str, fields: dict) -> bool:
    from supabase_pipeline import _rest, studio_write_source, supabase_configured

    source = settings_source(table_id)
    if not source or studio_write_source(settings) != "supabase" or not supabase_configured(settings):
        return False
    existing = _rest(
        settings,
        f"engagement_settings?airtable_record_id=eq.{quote(record_id, safe='')}&select=payload&limit=1",
        "GET",
    )
    prior = {}
    if isinstance(existing, list) and existing and isinstance(existing[0].get("payload"), dict):
        prior = existing[0]["payload"]
    payload = {**prior, **dict(fields or {}), "source": source}
    body = {"airtable_record_id": record_id, "payload": payload}
    if isinstance(existing, list) and existing:
        _rest(
            settings,
            f"engagement_settings?airtable_record_id=eq.{quote(record_id, safe='')}",
            "PATCH",
            body,
            prefer="return=minimal",
        )
    else:
        _rest(
            settings,
            "engagement_settings?on_conflict=airtable_record_id",
            "POST",
            [body],
            prefer="resolution=merge-duplicates,return=minimal",
        )
    return True
