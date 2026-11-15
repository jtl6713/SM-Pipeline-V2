"""Offline Airtable-shaped reference records for closeout GET quieting.

Brands / orgs / markets / verticals / personas / production profiles / prompts
are still resolved by P1/P3/P4/I4 via get_record / list_records. Under
STUDIO_WRITE_SOURCE=supabase those lookups must not hit the frozen archive.
The seed JSON is the SoR for the small active set until full Supabase mirrors
exist for every reference table.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from airtable.constants import (
    AI_PERSONAS_TABLE,
    BRANDS_TABLE,
    CONTENT_VERTICALS_TABLE,
    MARKETS_TABLE,
    ORGANIZATIONS_TABLE,
    PRODUCTION_PROFILES_TABLE,
    PROMPTS_TABLE,
)
from supabase_pipeline import studio_write_source, supabase_configured

logger = logging.getLogger("pipeline-runner.reference-cache")

REFERENCE_TABLES: frozenset[str] = frozenset(
    {
        ORGANIZATIONS_TABLE,
        BRANDS_TABLE,
        MARKETS_TABLE,
        CONTENT_VERTICALS_TABLE,
        AI_PERSONAS_TABLE,
        PRODUCTION_PROFILES_TABLE,
        PROMPTS_TABLE,
    }
)

_SEED_PATH = Path(__file__).resolve().parent / "data" / "airtable_reference_cache.json"


@lru_cache(maxsize=1)
def _seed() -> dict[str, Any]:
    try:
        payload = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        logger.warning("reference cache seed unavailable: %s", type(error).__name__)
        return {"records": [], "views": {}}
    if not isinstance(payload, dict):
        return {"records": [], "views": {}}
    return payload


def reference_cache_enabled(settings: dict | None, table_id: str) -> bool:
    return (
        str(table_id or "") in REFERENCE_TABLES
        and studio_write_source(settings) == "supabase"
        and supabase_configured(settings)
    )


def _records_for(table_id: str) -> list[dict[str, Any]]:
    rows = []
    for row in _seed().get("records") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("table_id") or "") != str(table_id or ""):
            continue
        rid = str(row.get("id") or "").strip()
        fields = row.get("fields") if isinstance(row.get("fields"), dict) else {}
        if not rid:
            continue
        rows.append({"id": rid, "fields": dict(fields)})
    return rows


def get_reference_record(settings: dict | None, table_id: str, record_id: str) -> dict | None:
    """Airtable-shaped record, or None when this table is not cache-backed."""
    if not reference_cache_enabled(settings, table_id):
        return None
    record_id = str(record_id or "").strip()
    if not record_id:
        return None
    for row in _records_for(table_id):
        if row["id"] == record_id:
            return row
    return None


def list_reference_records(
    settings: dict | None,
    table_id: str,
    *,
    view: str | None = None,
    max_records: int = 10,
) -> list[dict] | None:
    """View-scoped list for seeded reference tables, else None."""
    if not reference_cache_enabled(settings, table_id):
        return None
    view_name = str(view or "").strip()
    if not view_name:
        # Open lists without a view stay on Airtable until a formula path exists.
        return None
    views = (_seed().get("views") or {}).get(table_id) or {}
    if not isinstance(views, dict) or view_name not in views:
        return None
    wanted = {str(x) for x in (views.get(view_name) or []) if x}
    rows = [row for row in _records_for(table_id) if row["id"] in wanted]
    limit = max(1, min(int(max_records or 10), 100))
    return rows[:limit]
