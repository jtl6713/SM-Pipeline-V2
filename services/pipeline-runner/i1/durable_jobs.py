"""Durable, single-consumer I1 job spool. Opt-in; requires persistent SQLite volume.

The API acknowledges only after the job is committed. The consumer owns slow AI
and Airtable work; Cloudflare waitUntil is not part of the execution lifetime.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from airtable.client import AirtableClient
from airtable.constants import CONTENT_PROFILES_TABLE, IDEA_BATCHES_TABLE
from i1.processor import process_request

_LOG = logging.getLogger("pipeline-runner.i1.durable")
_RECORD = re.compile(r"^rec[A-Za-z0-9]{14}$")
_QUALITIES = {"Highest Quality", "Balanced", "Quantity"}
_LEASE_SECONDS = 120
# Model originality/365-day title dedupe can leave 8-9 of 10 after a pass.
# Bounded verified shortfall-only refill; never replays an uncertain Airtable POST.
_MAX_CONFIRMED_SHORTFALL_PASSES = 5
_WAKE = threading.Event()
_LOCK = threading.Lock()
_STARTED = False


class TerminalBatchMismatch(RuntimeError):
    """Operator reconciliation required: do not modify an existing terminal batch."""


def enabled() -> bool:
    return os.environ.get("I1_DURABLE_ENABLED", "").lower() in {"1", "true"}


def database_path() -> str:
    path = os.environ.get("I1_JOB_DB_PATH", "").strip()
    if not path or path == ":memory:" or not Path(path).is_absolute():
        raise RuntimeError("I1_JOB_DB_PATH must be an absolute path on a persistent volume")
    return path


def _connect() -> sqlite3.Connection:
    location = database_path()
    Path(location).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(location, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=15000")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS jobs (
        batch_id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        requested_count INTEGER NOT NULL,
        quality TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        run_token TEXT,
        lease_until REAL NOT NULL DEFAULT 0,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT
    )""")
    return db



@contextmanager
def _db():
    db = _connect()
    try:
        with db:
            yield db
    finally:
        db.close()


def enqueue(batch_id: str, profile_id: str, count: int, quality: str) -> dict:
    """Idempotent admission; identical batch requests never enqueue twice."""
    if not enabled():
        raise RuntimeError("I1 durable queue is disabled")
    if not _RECORD.fullmatch(batch_id) or not _RECORD.fullmatch(profile_id):
        raise ValueError("valid batch_record_id and profile_record_id are required")
    if not isinstance(count, int) or not 1 <= count <= 10 or quality not in _QUALITIES:
        raise ValueError("invalid I1 request")
    # Start/check the consumer BEFORE committing a receipt. Otherwise a startup
    # failure could return HTTP 503 after admission while the Worker incorrectly
    # marks the Airtable batch Failed, even though the job may run later.
    start_consumer()
    now = time.time()
    with _db() as db:
        inserted = db.execute(
            """INSERT OR IGNORE INTO jobs
            (batch_id, profile_id, requested_count, quality, status, created_at, updated_at)
            VALUES (?,?,?,?, 'queued', ?,?)""",
            (batch_id, profile_id, count, quality, now, now),
        ).rowcount == 1
        row = db.execute("SELECT * FROM jobs WHERE batch_id=?", (batch_id,)).fetchone()
        if (row["profile_id"], row["requested_count"], row["quality"]) != (profile_id, count, quality):
            raise ValueError("batch_id already exists with different immutable parameters")
        result = {"accepted": True, "batch_record_id": batch_id, "job_status": row["status"],
                  "already_exists": not inserted}
    _WAKE.set()
    return result


def status(batch_id: str) -> dict | None:
    if not _RECORD.fullmatch(batch_id):
        return None
    with _db() as db:
        row = db.execute("SELECT * FROM jobs WHERE batch_id=?", (batch_id,)).fetchone()
    return ({"batch_record_id": row["batch_id"], "status": row["status"],
             "attempts": row["attempts"], "error": row["error"]} if row else None)


def _claim() -> dict | None:
    now = time.time()
    token = uuid.uuid4().hex
    with _db() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            """SELECT * FROM jobs WHERE status='queued'
            OR (status='running' AND lease_until<?)
            ORDER BY created_at LIMIT 1""", (now,)
        ).fetchone()
        if row is None:
            return None
        db.execute(
            """UPDATE jobs SET status='running', run_token=?, lease_until=?,
               updated_at=?, attempts=attempts+1 WHERE batch_id=?""",
            (token, now + _LEASE_SECONDS, now, row["batch_id"]),
        )
    return {**dict(row), "run_token": token}


def _heartbeat(batch_id: str, token: str, stop: threading.Event) -> None:
    while not stop.wait(15):
        now = time.time()
        try:
            with _db() as db:
                changed = db.execute(
                    """UPDATE jobs SET lease_until=?, updated_at=?
                    WHERE batch_id=? AND run_token=? AND status='running'""",
                    (now + _LEASE_SECONDS, now, batch_id, token),
                ).rowcount
            if changed != 1:
                return
        except Exception:
            _LOG.exception("I1 heartbeat failed batch=%s", batch_id)


def _finish(job: dict, outcome: str, error: str | None = None) -> None:
    with _db() as db:
        db.execute(
            """UPDATE jobs SET status=?, error=?, lease_until=0, updated_at=?
            WHERE batch_id=? AND run_token=? AND status='running'""",
            (outcome, (error or "")[:500] or None, time.time(),
             job["batch_id"], job["run_token"]),
        )


def _linked_idea_count(batch: dict) -> int:
    links = (batch.get("fields") or {}).get("Idea Candidates") or []
    return len({link for link in links if isinstance(link, str) and _RECORD.fullmatch(link)})


def _clear_own_override(client: AirtableClient, profile_id: str, batch_id: str) -> None:
    profile = client.get_record(CONTENT_PROFILES_TABLE, profile_id)
    linked = (profile.get("fields") or {}).get("Manual_Idea_Batch") or []
    if batch_id in linked:
        client.update_record(CONTENT_PROFILES_TABLE, profile_id, {
            "Manual_Idea_Count_Override": None,
            "Manual_Idea_Quality_Override": None,
            "Manual_Idea_Batch": [],
        }, typecast=True)


def _work(job: dict) -> None:
    client = AirtableClient()
    batch_id, profile_id = job["batch_id"], job["profile_id"]
    expected = job["requested_count"]
    last_error = None
    try:
        batch = client.get_record(IDEA_BATCHES_TABLE, batch_id)
        fields = batch.get("fields") or {}
        profile_links = fields.get("Content_Profile") or []
        if profile_id not in profile_links or int(fields.get("Requested_Count") or 0) != expected:
            raise RuntimeError("batch profile/count mismatch: refusing generation")
        existing = _linked_idea_count(batch)
        # A completed batch is immutable; do not downgrade it to Failed even
        # if its linked-record count later changes or a stale lease is reclaimed.
        if str(fields.get("Status") or "") in {"Failed", "Complete"} and existing < expected:
            raise TerminalBatchMismatch(
                f"Terminal batch {fields.get('Status')} has {existing}/{expected} linked ideas; "
                "manual reconciliation required"
            )
        if existing >= expected:
            client.update_record(IDEA_BATCHES_TABLE, batch_id, {
                "Status": "Complete", "Generated_Count": existing,
                "Completed_At": datetime.now(timezone.utc).isoformat(), "Error": None,
            }, typecast=True)
            return
        client.update_record(IDEA_BATCHES_TABLE, batch_id, {
            "Status": "Running",
            "Started_At": fields.get("Started_At") or datetime.now(timezone.utc).isoformat(),
            "Generated_Count": existing,
            "Error": None,
        }, typecast=True)
        for _ in range(_MAX_CONFIRMED_SHORTFALL_PASSES):
            batch = client.get_record(IDEA_BATCHES_TABLE, batch_id)
            existing = _linked_idea_count(batch)
            missing = max(0, expected - existing)
            if not missing:
                break
            # Each attempt requests ONLY the freshly verified shortfall.
            # Duplicate/invalid model titles may reduce this pass below missing;
            # attempt another bounded pass only after an acknowledged write.
            # An ambiguous write always exits for human reconciliation.
            result = process_request(
                profile_record_id=profile_id, batch_record_id=batch_id,
                requested_count=missing, quality=job["quality"], trigger_i2=False,
            )
            if result.get("partial_failure") or result.get("retry_requires_reconciliation"):
                raise RuntimeError("I1 partial/uncertain write; reconcile batch before retry: "
                                   + str(result.get("error") or result.get("reason") or "unknown"))
            batch = client.get_record(IDEA_BATCHES_TABLE, batch_id)
            actual = _linked_idea_count(batch)
            client.update_record(IDEA_BATCHES_TABLE, batch_id, {"Generated_Count": actual})
            if actual >= expected:
                break
            if actual <= existing:
                last_error = str(result.get("reason") or "no new unique candidates")
                break
        batch = client.get_record(IDEA_BATCHES_TABLE, batch_id)
        actual = _linked_idea_count(batch)
        if actual != expected:
            raise RuntimeError(f"Only {actual} of {expected} linked ideas verified"
                               + (f": {last_error}" if last_error else ""))
        client.update_record(IDEA_BATCHES_TABLE, batch_id, {
            "Status": "Complete", "Generated_Count": actual,
            "Completed_At": datetime.now(timezone.utc).isoformat(), "Error": None,
        }, typecast=True)
    except Exception as exc:
        _LOG.exception("I1 durable job failed batch=%s", batch_id)
        if isinstance(exc, TerminalBatchMismatch):
            # Do not downgrade, clear, or overwrite the authority's terminal
            # record merely because this ledger was replayed.
            raise
        try:
            batch = client.get_record(IDEA_BATCHES_TABLE, batch_id)
            actual = _linked_idea_count(batch)
            client.update_record(IDEA_BATCHES_TABLE, batch_id, {
                "Status": "Failed", "Generated_Count": actual,
                "Completed_At": datetime.now(timezone.utc).isoformat(),
                "Error": f"{actual}/{expected} verified. {type(exc).__name__}: {exc}"[:1000],
            }, typecast=True)
        except Exception:
            _LOG.exception("I1 failed-state Airtable update failed; ledger preserved")
        raise
    finally:
        try:
            _clear_own_override(client, profile_id, batch_id)
        except Exception:
            _LOG.exception("I1 profile override cleanup failed batch=%s", batch_id)


def _consume() -> None:
    while True:
        try:
            job = _claim()
            if job is None:
                _WAKE.wait(5)
                _WAKE.clear()
                continue
            stop = threading.Event()
            beat = threading.Thread(target=_heartbeat, args=(job["batch_id"], job["run_token"], stop),
                                    daemon=True, name="i1-heartbeat")
            beat.start()
            try:
                _work(job)
            except Exception as exc:
                _finish(job, "failed", f"{type(exc).__name__}: {exc}")
            else:
                _finish(job, "complete")
            finally:
                stop.set()
                beat.join(timeout=2)
        except Exception:
            _LOG.exception("I1 durable consumer loop error")
            time.sleep(5)


def start_consumer() -> None:
    global _STARTED
    if not enabled():
        return
    with _LOCK:
        if _STARTED:
            return
        with _db():  # fail closed on missing/unwritable persistent path
            pass
        thread = threading.Thread(target=_consume, daemon=True, name="i1-durable-consumer")
        thread.start()
        _STARTED = True
