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
from urllib.parse import urlsplit

import requests

logger = logging.getLogger("pipeline-runner.airtable.egress")


def _metrics_path():
    """Explicit runtime persistent volume path; never claim durability from /tmp."""
    return os.environ.get("AIRTABLE_EGRESS_SQLITE_PATH", "/scratch/metrics/airtable-egress.sqlite").strip()


def persist_airtable_egress(method: str, status: int, at=None) -> bool:
    target = _metrics_path()
    if not target:
        return False
    at = at or datetime.now(timezone.utc)
    try:
        path = Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(path), timeout=3) as db:
            db.execute("PRAGMA busy_timeout=3000")
            db.execute("CREATE TABLE IF NOT EXISTS hourly (hour_utc TEXT NOT NULL, source TEXT NOT NULL, method TEXT NOT NULL, status_class TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(hour_utc,source,method,status_class))")
            hour = at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
            cls = "429" if status == 429 else (str(status // 100) + "xx" if status else "network")
            db.execute("INSERT INTO hourly (hour_utc,source,method,status_class,attempts) VALUES (?,?,?,?,1) ON CONFLICT(hour_utc,source,method,status_class) DO UPDATE SET attempts=attempts+1",
                       (hour, "pipeline_runner_http", method.upper(), cls))
        return True
    except (OSError, sqlite3.Error) as error:
        logger.warning("durable airtable egress counter unavailable: %s", type(error).__name__)
        return False


def read_airtable_egress(hours: int = 48) -> dict:
    path = _metrics_path()
    if not path or not Path(path).exists():
        return {"ok": False, "reason": "persistent_metrics_store_not_configured", "hourly": []}
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(hours=max(1, min(72, hours)))).strftime("%Y-%m-%dT%H:00:00Z")
    with sqlite3.connect(path, timeout=3) as db:
        rows = db.execute("SELECT hour_utc,source,method,status_class,attempts FROM hourly WHERE hour_utc>=? ORDER BY hour_utc,source,method,status_class", (since,)).fetchall()
    # A live exporter read is a collector heartbeat, not proof that every
    # independent process emitted its requests. Never backfill missing hours.
    observed_at = datetime.now(timezone.utc).isoformat()
    return {"ok": True, "source": "pipeline_runner_sqlite",
            "collector_heartbeat": {"observed_at": observed_at, "ok": True,
                                    "scope": "this_runner_metrics_store_only"},
            "hourly": [
        dict(zip(("hour_utc","source","method","status_class","attempts"), row)) for row in rows
    ]}

_original_send = requests.sessions.Session.send


def install_airtable_egress_monitor() -> None:
    if getattr(requests.sessions.Session.send, "_studio_airtable_monitored", False):
        return

    def monitored_send(session, request, **kwargs):
        if urlsplit(request.url).hostname != "api.airtable.com":
            return _original_send(session, request, **kwargs)
        started = time.monotonic()
        response = None
        try:
            response = _original_send(session, request, **kwargs)
            return response
        finally:
            persist_airtable_egress(request.method, response.status_code if response is not None else 0)
            logger.info("studio_airtable_egress_v1 %s", json.dumps({
                "source": "pipeline_runner_http",
                "table_kind": "unknown",
                "method": request.method.upper(),
                "status": response.status_code if response is not None else 0,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "at": datetime.now(timezone.utc).isoformat(),
                "request_count": 1,
            }, separators=(",", ":")))

    monitored_send._studio_airtable_monitored = True
    requests.sessions.Session.send = monitored_send
