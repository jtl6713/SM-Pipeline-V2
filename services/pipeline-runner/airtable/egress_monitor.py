"""Observe every requests-based Airtable call in the pipeline-runner process.

Idempotent installation at process startup. Never log URL, record IDs,
payloads, authorization headers or filter formulas. Supports ordinary
requests.get/post/patch/delete and Sessions via Session.send.
"""
import json
import logging
import time
import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit

import requests

from airtable.constants import (
    AI_PERSONAS_TABLE,
    ASSET_REQUESTS_TABLE,
    ASSET_REQUEST_SHOTS_TABLE,
    BRANDS_TABLE,
    CAROUSEL_SLIDES_TABLE,
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    CONTENT_VERTICALS_TABLE,
    IDEA_BATCHES_TABLE,
    MAKE_ADMIN_QUEUE_TABLE,
    MARKETS_TABLE,
    MEDIA_ASSETS_TABLE,
    MEDIA_TRANSFER_QUEUE_TABLE,
    ORGANIZATIONS_TABLE,
    PIPELINE_SETTINGS_TABLE,
    PLATFORM_OUTPUT_MAPPINGS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_PROFILES_TABLE,
    PRODUCTION_REQUESTS_TABLE,
    PROMPTS_TABLE,
    SOURCE_CANDIDATES_TABLE,
)
from settings_store import ENGAGEMENT_SETTINGS_TABLE

logger = logging.getLogger("pipeline-runner.airtable.egress")

# Coarse non-secret labels for quiet-window attribution. Unknown stays "other".
_TABLE_KIND_BY_ID = {
    PLATFORM_OUTPUTS_TABLE: "outputs",
    CONTENT_ITEMS_TABLE: "content",
    PRODUCTION_REQUESTS_TABLE: "requests",
    MEDIA_ASSETS_TABLE: "media",
    MEDIA_TRANSFER_QUEUE_TABLE: "queue",
    CAROUSEL_SLIDES_TABLE: "slides",
    SOURCE_CANDIDATES_TABLE: "ideas",
    CONTENT_PROFILES_TABLE: "profiles",
    PIPELINE_SETTINGS_TABLE: "settings",
    ENGAGEMENT_SETTINGS_TABLE: "engagement_settings",
    IDEA_BATCHES_TABLE: "idea_batches",
    MAKE_ADMIN_QUEUE_TABLE: "make_admin",
    ORGANIZATIONS_TABLE: "organizations",
    BRANDS_TABLE: "brands",
    MARKETS_TABLE: "markets",
    CONTENT_VERTICALS_TABLE: "verticals",
    AI_PERSONAS_TABLE: "personas",
    PRODUCTION_PROFILES_TABLE: "production_profiles",
    PLATFORM_OUTPUT_MAPPINGS_TABLE: "output_mappings",
    PROMPTS_TABLE: "prompts",
    ASSET_REQUESTS_TABLE: "asset_requests",
    ASSET_REQUEST_SHOTS_TABLE: "asset_shots",
    "tblcDNIZs125iVi2B": "insights_observations",
    "tblb6LfRv7CemHHN6": "insights_learned",
    "tblhE7YHDnj2lxJPC": "engagement",
    "tbl1bjkyC2jAgt3tl": "engagement",
    # Rendering review / native gallery side tables
    "tblHX3UdoNszkoquG": "review_sessions",
    "tblUkZB6SMtf9Ib6I": "review_jobs",
    "tbl7wPOAE26o2coMU": "review_attempts",
    "tblalFXUJyYg5PBrz": "review_plans",
    "tbl5sq9xBrF6bgPph": "native_gallery_jobs",
}


def table_kind_from_airtable_url(url: str) -> str:
    """Map /v0/{base}/{tableId}... to a coarse table_kind. Never return the raw id."""
    path = unquote(urlsplit(str(url or "")).path or "")
    parts = [p for p in path.split("/") if p]
    # ["v0", baseId, tableId, optionalRecordId]
    if len(parts) < 3 or parts[0] != "v0":
        return "other"
    table_id = parts[2]
    return _TABLE_KIND_BY_ID.get(table_id, "other")


def _metrics_path():
    """Explicit runtime persistent volume path; never claim durability from /tmp."""
    return os.environ.get("AIRTABLE_EGRESS_SQLITE_PATH", "/scratch/metrics/airtable-egress.sqlite").strip()


def _ensure_hourly_schema(db: sqlite3.Connection) -> None:
    db.execute(
        "CREATE TABLE IF NOT EXISTS hourly ("
        "hour_utc TEXT NOT NULL, source TEXT NOT NULL, method TEXT NOT NULL, "
        "status_class TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, "
        "PRIMARY KEY(hour_utc,source,method,status_class))"
    )
    cols = {row[1] for row in db.execute("PRAGMA table_info(hourly)").fetchall()}
    if "table_kind" in cols:
        return
    db.execute("ALTER TABLE hourly RENAME TO hourly_legacy")
    db.execute(
        "CREATE TABLE hourly ("
        "hour_utc TEXT NOT NULL, source TEXT NOT NULL, method TEXT NOT NULL, "
        "status_class TEXT NOT NULL, table_kind TEXT NOT NULL DEFAULT 'unknown', "
        "attempts INTEGER NOT NULL DEFAULT 0, "
        "PRIMARY KEY(hour_utc,source,method,status_class,table_kind))"
    )
    db.execute(
        "INSERT INTO hourly (hour_utc,source,method,status_class,table_kind,attempts) "
        "SELECT hour_utc,source,method,status_class,'unknown',attempts FROM hourly_legacy"
    )
    db.execute("DROP TABLE hourly_legacy")


def persist_airtable_egress(method: str, status: int, at=None, *, table_kind: str = "unknown") -> bool:
    target = _metrics_path()
    if not target:
        return False
    at = at or datetime.now(timezone.utc)
    kind = str(table_kind or "unknown").strip() or "unknown"
    try:
        path = Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(str(path), timeout=3)
        try:
            db.execute("PRAGMA busy_timeout=3000")
            _ensure_hourly_schema(db)
            hour = at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
            cls = "429" if status == 429 else (str(status // 100) + "xx" if status else "network")
            db.execute(
                "INSERT INTO hourly (hour_utc,source,method,status_class,table_kind,attempts) "
                "VALUES (?,?,?,?,?,1) ON CONFLICT(hour_utc,source,method,status_class,table_kind) "
                "DO UPDATE SET attempts=attempts+1",
                (hour, "pipeline_runner_http", method.upper(), cls, kind),
            )
            db.commit()
        finally:
            db.close()
        return True
    except (OSError, sqlite3.Error) as error:
        logger.warning("durable airtable egress counter unavailable: %s", type(error).__name__)
        return False


def summarize_airtable_activity(hourly, window_hours: int = 48) -> dict:
    """Count real api.airtable.com attempts. A skipped Supabase-only commit is not an attempt."""
    reads = 0
    writes = 0
    for row in hourly or []:
        attempts = int(row.get("attempts") or 0)
        method = str(row.get("method") or "").upper()
        if method == "GET":
            reads += attempts
        elif method in {"POST", "PUT", "PATCH", "DELETE"}:
            writes += attempts
    return {
        "ok": True,
        "window_hours": window_hours,
        "read_attempts": reads,
        "write_attempts": writes,
        "any_read": reads > 0,
        "any_write": writes > 0,
        "any_activity": reads + writes > 0,
    }


def read_airtable_egress(hours: int = 48) -> dict:
    path = _metrics_path()
    if not path or not Path(path).exists():
        return {"ok": False, "reason": "persistent_metrics_store_not_configured", "hourly": []}
    from datetime import timedelta
    window = max(1, min(72, hours))
    since = (datetime.now(timezone.utc) - timedelta(hours=window)).strftime("%Y-%m-%dT%H:00:00Z")
    db = sqlite3.connect(path, timeout=3)
    try:
        _ensure_hourly_schema(db)
        rows = db.execute(
            "SELECT hour_utc,source,method,status_class,table_kind,attempts "
            "FROM hourly WHERE hour_utc>=? ORDER BY hour_utc,source,method,status_class,table_kind",
            (since,),
        ).fetchall()
    finally:
        db.close()
    # A live exporter read is a collector heartbeat, not proof that every
    # independent process emitted its requests. Never backfill missing hours.
    observed_at = datetime.now(timezone.utc).isoformat()
    hourly = [
        dict(zip(("hour_utc", "source", "method", "status_class", "table_kind", "attempts"), row))
        for row in rows
    ]
    return {"ok": True, "source": "pipeline_runner_sqlite",
            "collector_heartbeat": {"observed_at": observed_at, "ok": True,
                                    "scope": "this_runner_metrics_store_only"},
            "hourly": hourly,
            "activity": summarize_airtable_activity(hourly, window)}

_original_send = requests.sessions.Session.send


def install_airtable_egress_monitor() -> None:
    if getattr(requests.sessions.Session.send, "_studio_airtable_monitored", False):
        return

    def monitored_send(session, request, **kwargs):
        if urlsplit(request.url).hostname != "api.airtable.com":
            return _original_send(session, request, **kwargs)
        started = time.monotonic()
        response = None
        kind = table_kind_from_airtable_url(request.url)
        try:
            response = _original_send(session, request, **kwargs)
            return response
        finally:
            persist_airtable_egress(
                request.method,
                response.status_code if response is not None else 0,
                table_kind=kind,
            )
            logger.info("studio_airtable_egress_v1 %s", json.dumps({
                "source": "pipeline_runner_http",
                "table_kind": kind,
                "method": request.method.upper(),
                "status": response.status_code if response is not None else 0,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "at": datetime.now(timezone.utc).isoformat(),
                "request_count": 1,
            }, separators=(",", ":")))

    monitored_send._studio_airtable_monitored = True
    requests.sessions.Session.send = monitored_send
