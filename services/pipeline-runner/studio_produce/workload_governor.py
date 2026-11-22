"""Single-host, cross-process durable workload governor for incident #2670.

SQLite is local to the Windows runner host, not Supabase, so admission itself
does not add load during a database outage. All runner processes on this host
MUST use the same absolute DB path. Do not enable on multiple independent hosts
without replacing this store with a shared transactional coordinator.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator

logger = logging.getLogger("pipeline-runner.workload-governor")
DISPATCH_INTERVAL = 2.0
MAX_REQUEUE_DELAY_SECONDS = 15 * 60
MAX_CONSECUTIVE_YIELDS = 8
HEARTBEAT_INTERVAL = 30.0
LEASE_SECONDS = 20 * 60
DEFAULT_MAX_JOBS = 2
DEFAULT_MAX_PHOTO_GROUPS = 4
DEFAULT_RATIO_WORKERS = 2

_dispatch_lock = threading.Lock()
_dispatch_started = False


def enabled() -> bool:
    return os.getenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def max_jobs() -> int:
    return _limit("STUDIO_MAX_PRODUCER_JOBS", DEFAULT_MAX_JOBS, 1, 8)


def max_photo_groups() -> int:
    return _limit("STUDIO_MAX_PHOTO_GROUPS", DEFAULT_MAX_PHOTO_GROUPS, 1, 16)


def max_ratio_workers() -> int:
    return _limit("STUDIO_MAX_RATIO_WORKERS", DEFAULT_RATIO_WORKERS, 1, 4)


def _limit(name: str, default: int, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(os.getenv(name) or default)))
    except (TypeError, ValueError):
        return default


def max_db_reads() -> int:
    return _limit("STUDIO_MAX_DB_READS", 6, 1, 32)


def max_db_writes() -> int:
    return _limit("STUDIO_MAX_DB_WRITES", 3, 1, 16)


def database_path() -> Path:
    configured = os.getenv("STUDIO_GOVERNOR_DB_PATH", "").strip()
    if not configured:
        # Never silently create a production queue under a volatile TEMP folder.
        # Starting the governor requires a deliberate, persistent host path.
        raise RuntimeError("STUDIO_GOVERNOR_DB_PATH must be configured before enabling the governor")
    path = Path(configured).expanduser()
    if not path.is_absolute():
        raise ValueError("STUDIO_GOVERNOR_DB_PATH must be absolute")
    return path


_schema_lock = threading.Lock()
_initialized_paths: set[str] = set()


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    path = database_path()
    identity = str(path)
    if identity not in _initialized_paths:
        with _schema_lock:
            if identity not in _initialized_paths:
                path.parent.mkdir(parents=True, exist_ok=True)
                init = sqlite3.connect(identity, timeout=5, isolation_level=None)
                try:
                    init.execute("PRAGMA busy_timeout=5000")
                    init.execute("PRAGMA journal_mode=WAL")
                    init.execute("""CREATE TABLE IF NOT EXISTS producer_jobs (
                        request_id TEXT PRIMARY KEY, state TEXT NOT NULL,
                        token TEXT, lease_until REAL, enqueued_at REAL NOT NULL,
                        available_at REAL NOT NULL DEFAULT 0,
                        consecutive_yields INTEGER NOT NULL DEFAULT 0
                    )""")
                    existing = {row[1] for row in init.execute("PRAGMA table_info(producer_jobs)")}
                    if "available_at" not in existing:
                        init.execute("ALTER TABLE producer_jobs ADD COLUMN available_at REAL NOT NULL DEFAULT 0")
                    if "consecutive_yields" not in existing:
                        init.execute("ALTER TABLE producer_jobs ADD COLUMN consecutive_yields INTEGER NOT NULL DEFAULT 0")
                    init.execute("""CREATE TABLE IF NOT EXISTS resource_leases (
                        scope TEXT NOT NULL, lease_key TEXT NOT NULL,
                        token TEXT NOT NULL, lease_until REAL NOT NULL,
                        PRIMARY KEY (scope, lease_key)
                    )""")
                    init.execute("""CREATE TABLE IF NOT EXISTS governor_control (
                        name TEXT PRIMARY KEY, until_at REAL NOT NULL
                    )""")
                    init.execute("""CREATE TABLE IF NOT EXISTS request_metrics (
                        minute INTEGER NOT NULL, operation TEXT NOT NULL,
                        total INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY (minute, operation)
                    )""")
                    _initialized_paths.add(identity)
                finally:
                    init.close()
    db = sqlite3.connect(identity, timeout=5, isolation_level=None)
    try:
        db.execute("PRAGMA busy_timeout=5000")
        yield db
    finally:
        db.close()

def _transaction(db: sqlite3.Connection) -> None:
    db.execute("BEGIN IMMEDIATE")


def enqueue(request_id: str) -> bool:
    """Durably queue exactly once. Return True only for a new entry."""
    with _connect() as db:
        _transaction(db)
        now = time.time()
        created = db.execute(
            "INSERT OR IGNORE INTO producer_jobs(request_id,state,enqueued_at,available_at) VALUES(?,'queued',?,?)",
            (request_id, now, now),
        ).rowcount
        db.commit()
    return bool(created)


def circuit_open(db: sqlite3.Connection | None = None) -> bool:
    if not enabled():
        return False
    if db is None:
        with _connect() as connection:
            return circuit_open(connection)
    row = db.execute("SELECT until_at FROM governor_control WHERE name='database'").fetchone()
    return bool(row and float(row[0]) > time.time())


def trip_database_circuit(*, cooldown_seconds: float = 90) -> None:
    with _connect() as db:
        _transaction(db)
        until = time.time() + max(30.0, cooldown_seconds)
        db.execute("""INSERT INTO governor_control(name,until_at) VALUES('database',?)
            ON CONFLICT(name) DO UPDATE SET until_at=max(until_at,excluded.until_at)""", (until,))
        db.commit()
    logger.warning("database workload circuit open for at least %.0fs", cooldown_seconds)


def is_database_overload(error: BaseException) -> bool:
    message = str(error).lower()
    if "supabase" in message and any(code in message for code in
        (" 429", " 500", " 502", " 503", " 504", " 522", "timeout", "timed out")):
        return True
    return any(s in message for s in (
        "connection terminated due to connection timeout",
        "supabase connection", "http 522", "status 522", "pgrst",
        "database connection", "too many connections", "database is locked", "disk i/o error",
    ))


def claim_next() -> tuple[str, str] | None:
    """Atomic FIFO claim and cross-process concurrency check."""
    with _connect() as db:
        _transaction(db)
        now = time.time()
        db.execute("""UPDATE producer_jobs
            SET state='queued', token=NULL, lease_until=NULL,
                available_at=CASE WHEN available_at>? THEN available_at ELSE ? END
            WHERE state='running' AND lease_until < ?""", (now + 30, now + 30, now))
        if circuit_open(db):
            db.commit()
            return None
        active = db.execute("SELECT COUNT(*) FROM producer_jobs WHERE state='running'").fetchone()[0]
        # After a circuit cooldown, probe with one producer before returning to
        # normal concurrency. A successful job finish clears the half-open latch.
        has_outage = db.execute("SELECT 1 FROM governor_control WHERE name='database'").fetchone()
        allowed = 1 if has_outage else max_jobs()
        if active >= allowed:
            db.commit()
            return None
        row = db.execute(
            "SELECT request_id FROM producer_jobs WHERE state='queued' AND available_at<=? ORDER BY enqueued_at, request_id LIMIT 1"
            , (now,)
        ).fetchone()
        if not row:
            db.commit()
            return None
        token = uuid.uuid4().hex
        db.execute(
            "UPDATE producer_jobs SET state='running',token=?,lease_until=? WHERE request_id=? AND state='queued'",
            (token, now + LEASE_SECONDS, row[0]),
        )
        db.commit()
    return str(row[0]), token


def renew_job(request_id: str, token: str) -> bool:
    with _connect() as db:
        changed = db.execute("""UPDATE producer_jobs SET lease_until=?
            WHERE request_id=? AND state='running' AND token=?""",
            (time.time() + LEASE_SECONDS, request_id, token),
        ).rowcount
    return bool(changed)


def job_valid(request_id: str, token: str) -> bool:
    with _connect() as db:
        row = db.execute("SELECT state,token,lease_until FROM producer_jobs WHERE request_id=?",
                         (request_id,)).fetchone()
    return bool(row and row[0] == "running" and row[1] == token and row[2] > time.time())


def finish_job(request_id: str, token: str, *, requeue: bool = False, progressed: bool = False) -> None:
    """Yielded jobs are delayed and eventually parked for explicit review.

    A parked job is retained (never discarded) and can be resumed through
    a specifically authorized admission, but cannot pound Supabase forever.
    """
    with _connect() as db:
        _transaction(db)
        if requeue:
            row = db.execute(
                "SELECT consecutive_yields FROM producer_jobs WHERE request_id=? AND token=?",
                (request_id, token),
            ).fetchone()
            if row:
                streak = 1 if progressed else int(row[0]) + 1
                parked = streak >= MAX_CONSECUTIVE_YIELDS
                delay = min(MAX_REQUEUE_DELAY_SECONDS, 30 * (2 ** min(streak - 1, 5)))
                db.execute("""UPDATE producer_jobs SET state=?,token=NULL,lease_until=NULL,
                    available_at=?,consecutive_yields=? WHERE request_id=? AND token=?""",
                    ("paused" if parked else "queued", time.time() + delay, streak, request_id, token))
                if parked:
                    logger.error("producer request=%s paused after repeated no-progress yields", request_id)
        else:
            deleted = db.execute("DELETE FROM producer_jobs WHERE request_id=? AND token=?", (request_id, token))
            if deleted.rowcount:
                db.execute("DELETE FROM governor_control WHERE name='database' AND until_at<=?", (time.time(),))
        db.commit()


def _heartbeat(stop: threading.Event, renew: Callable[[], bool]) -> None:
    while not stop.wait(HEARTBEAT_INTERVAL):
        try:
            if not renew():
                logger.error("workload lease ownership lost; abort at next checkpoint")
                stop.set()
        except Exception:
            logger.exception("workload lease heartbeat failed; stop at next checkpoint")
            stop.set()


@contextmanager
def job_heartbeat(request_id: str, token: str) -> Iterator[threading.Event]:
    stopped = threading.Event()
    thread = threading.Thread(target=_heartbeat, args=(stopped, lambda: renew_job(request_id, token)),
                              daemon=True, name="studio-job-lease-heartbeat")
    thread.start()
    try:
        yield stopped
    finally:
        stopped.set()
        thread.join(timeout=1)


@contextmanager
def resource_slot(scope: str, *, key: str = "", limit: int = 1, allow_during_circuit: bool = False) -> Iterator[None]:
    """Atomic, expiring single-host claims for photo-group and transfer work."""
    if not enabled():
        yield
        return
    token = uuid.uuid4().hex
    lease_key = key or token
    while True:
        with _connect() as db:
            _transaction(db)
            db.execute("DELETE FROM resource_leases WHERE lease_until < ?", (time.time(),))
            active = db.execute("SELECT COUNT(*) FROM resource_leases WHERE scope=?", (scope,)).fetchone()[0]
            if (allow_during_circuit or not circuit_open(db)) and active < limit:
                claimed = db.execute("""INSERT OR IGNORE INTO resource_leases
                    (scope,lease_key,token,lease_until) VALUES(?,?,?,?)""",
                    (scope, lease_key, token, time.time() + LEASE_SECONDS)).rowcount
            else:
                claimed = 0
            db.commit()
        if claimed:
            break
        time.sleep(DISPATCH_INTERVAL)
    stopped = threading.Event()
    def _renew() -> bool:
        with _connect() as db:
            return bool(db.execute("""UPDATE resource_leases SET lease_until=?
                WHERE scope=? AND lease_key=? AND token=?""",
                (time.time() + LEASE_SECONDS, scope, lease_key, token)).rowcount)
    # Supabase REST has a 20-second timeout; a 20-minute lease is sufficient.
    # Spawning a heartbeat thread for *every* HTTP call would itself be a
    # measurable overhead at the incident's request rates.
    renewer = None
    if not scope.startswith("supabase_"):
        renewer = threading.Thread(target=_heartbeat, args=(stopped, _renew), daemon=True,
                                   name="studio-resource-lease-heartbeat")
        renewer.start()
    try:
        yield
    finally:
        stopped.set()
        if renewer is not None:
            renewer.join(timeout=1)
        with _connect() as db:
            db.execute("DELETE FROM resource_leases WHERE scope=? AND lease_key=? AND token=?",
                       (scope, lease_key, token))


def resource_active(scope: str, key: str) -> bool:
    if not enabled():
        return False
    with _connect() as db:
        row = db.execute("""SELECT 1 FROM resource_leases
            WHERE scope=? AND lease_key=? AND lease_until>?""",
            (scope, key, time.time())).fetchone()
    return bool(row)


def record_db_request(method: str, *, failed: bool) -> None:
    if not enabled():
        return
    minute = int(time.time() // 60)
    operation = "read" if method.upper() in {"GET", "HEAD"} else "write"
    with _connect() as db:
        db.execute("""INSERT INTO request_metrics(minute,operation,total,failures)
            VALUES(?,?,1,?)
            ON CONFLICT(minute,operation) DO UPDATE SET
            total=total+1, failures=failures+excluded.failures""",
            (minute, operation, int(failed)))
        # Keep only 30 minutes of local counters (no request payloads or IDs).
        db.execute("DELETE FROM request_metrics WHERE minute<?", (minute - 30,))


def snapshot() -> dict[str, object]:
    if not enabled():
        return {"enabled": False}
    with _connect() as db:
        counts = db.execute("SELECT state,COUNT(*) FROM producer_jobs GROUP BY state").fetchall()
        groups = db.execute("""SELECT COUNT(*) FROM resource_leases
            WHERE scope='photo_group' AND lease_until>?""", (time.time(),)).fetchone()[0]
        queued = dict(counts)
        rows = db.execute("""SELECT operation,SUM(total),SUM(failures) FROM request_metrics
            WHERE minute>=? GROUP BY operation""", (int(time.time() // 60)-1,)).fetchall()
        traffic = {operation: {"requests_last_two_minutes": total, "failures_last_two_minutes": failed}
                   for operation, total, failed in rows}
        return {
            "enabled": True, "scope": "single_windows_host", "active_jobs": queued.get("running", 0),
            "queued_jobs": queued.get("queued", 0), "active_photo_groups": groups,
            "max_jobs": max_jobs(), "max_photo_groups": max_photo_groups(),
            "max_ratio_workers": max_ratio_workers(), "database_circuit_open": circuit_open(db),
            "max_db_reads": max_db_reads(), "max_db_writes": max_db_writes(),
            "supabase_request_metrics": traffic,
        }


def ensure_dispatcher(worker: Callable[[str, str], None]) -> None:
    global _dispatch_started
    if not enabled():
        return
    with _dispatch_lock:
        if _dispatch_started:
            return
        def _dispatch() -> None:
            while True:
                try:
                    claim = claim_next()
                    if claim:
                        request_id, token = claim
                        threading.Thread(target=worker, args=(request_id, token), daemon=True,
                                         name=f"studio-governed-{request_id}").start()
                except Exception:
                    logger.exception("workload dispatcher failed; retaining durable jobs")
                time.sleep(DISPATCH_INTERVAL)
        threading.Thread(target=_dispatch, daemon=True, name="studio-workload-dispatcher").start()
        _dispatch_started = True
