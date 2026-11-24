"""Single-host, cross-process durable workload governor for incident #2670.

SQLite is local to the Windows runner host, not Supabase, so admission itself
does not add load during a database outage. All runner processes on this host
MUST use the same absolute DB path. Do not enable on multiple independent hosts
without replacing this store with a shared transactional coordinator.
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
from contextvars import ContextVar
from pathlib import Path
from typing import Callable, Iterator

logger = logging.getLogger("pipeline-runner.workload-governor")
DISPATCH_INTERVAL = 2.0
MAX_REQUEUE_DELAY_SECONDS = 15 * 60
MAX_CONSECUTIVE_YIELDS = 8
HEARTBEAT_INTERVAL = 30.0
LEASE_SECONDS = 20 * 60
# A dead client can leave a server-side HTTP request in flight. Preserve a
# conservative settling interval before reclaiming a proven-dead DB owner.
DB_DEAD_OWNER_GRACE_SECONDS = 120
_DB_REQUEST_SCOPES = frozenset({"supabase_read", "supabase_write"})
DEFAULT_MAX_JOBS = 2
DEFAULT_MAX_PHOTO_GROUPS = 4
DEFAULT_RATIO_WORKERS = 2

_dispatch_lock = threading.Lock()
_dispatch_started = False

# Context is only entered by the authenticated A3 recovery worker while it
# holds a single-image governor lease. No other producer gets write access.
_A3_METADATA_WRITES = ContextVar("incident_2670_a3_metadata_writes", default=False)


class AdmissionDeferred(RuntimeError):
    """A non-destructive admission timeout: keep work queued, never mark failed."""


def enabled() -> bool:
    return os.getenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def recovery_read_only_active() -> bool:
    return os.getenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "").strip().lower() in {
        "1", "true", "yes",
    }


def producer_only_recovery_target() -> str:
    """An explicit single request, or ALL after the bounded canary succeeds."""
    return os.getenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET", "").strip()


def producer_only_recovery_enabled() -> bool:
    """Keep the publisher HTTP fence while admitting governed Studio producers."""
    target = producer_only_recovery_target()
    allowed_target = target == "ALL" or bool(re.fullmatch(r"rec[A-Za-z0-9]{6,}", target))
    return (
        enabled() and recovery_read_only_active() and allowed_target
        and os.getenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY", "").strip().lower()
        in {"1", "true", "yes"}
    )


def admission_paused() -> bool:
    """Outage fence remains for all jobs unless a scoped producer canary is enabled."""
    return recovery_read_only_active() and not producer_only_recovery_enabled()


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
                        consecutive_yields INTEGER NOT NULL DEFAULT 0,
                        resume_requested INTEGER NOT NULL DEFAULT 0
                    )""")
                    existing = {row[1] for row in init.execute("PRAGMA table_info(producer_jobs)")}
                    if "available_at" not in existing:
                        init.execute("ALTER TABLE producer_jobs ADD COLUMN available_at REAL NOT NULL DEFAULT 0")
                    if "consecutive_yields" not in existing:
                        init.execute("ALTER TABLE producer_jobs ADD COLUMN consecutive_yields INTEGER NOT NULL DEFAULT 0")
                    if "resume_requested" not in existing:
                        init.execute("ALTER TABLE producer_jobs ADD COLUMN resume_requested INTEGER NOT NULL DEFAULT 0")
                    init.execute("""CREATE TABLE IF NOT EXISTS resource_leases (
                        scope TEXT NOT NULL, lease_key TEXT NOT NULL,
                        token TEXT NOT NULL, lease_until REAL NOT NULL,
                        PRIMARY KEY (scope, lease_key)
                    )""")
                    # Serialize the additive migration across runner processes.
                    # Legacy leases have no owner evidence and retain normal expiry.
                    init.execute("BEGIN IMMEDIATE")
                    try:
                        resource_columns = {row[1] for row in init.execute("PRAGMA table_info(resource_leases)")}
                        if "owner_pid" not in resource_columns:
                            init.execute("ALTER TABLE resource_leases ADD COLUMN owner_pid INTEGER")
                        if "owner_dead_seen_at" not in resource_columns:
                            init.execute("ALTER TABLE resource_leases ADD COLUMN owner_dead_seen_at REAL")
                        init.commit()
                    except BaseException:
                        init.rollback()
                        raise
                    init.execute("""CREATE TABLE IF NOT EXISTS governor_control (
                        name TEXT PRIMARY KEY, until_at REAL NOT NULL
                    )""")
                    init.execute("""CREATE TABLE IF NOT EXISTS request_metrics (
                        minute INTEGER NOT NULL, operation TEXT NOT NULL,
                        total INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
                        latency_total_ms REAL NOT NULL DEFAULT 0,
                        latency_max_ms REAL NOT NULL DEFAULT 0,
                        PRIMARY KEY (minute, operation)
                    )""")
                    metric_columns = {row[1] for row in init.execute("PRAGMA table_info(request_metrics)")}
                    if "latency_total_ms" not in metric_columns:
                        init.execute("ALTER TABLE request_metrics ADD COLUMN latency_total_ms REAL NOT NULL DEFAULT 0")
                    if "latency_max_ms" not in metric_columns:
                        init.execute("ALTER TABLE request_metrics ADD COLUMN latency_max_ms REAL NOT NULL DEFAULT 0")
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


def enqueue(request_id: str, *, resume: bool = False) -> bool:
    """Durably queue exactly once. Return True only for a new entry."""
    with _connect() as db:
        _transaction(db)
        now = time.time()
        created = db.execute(
            "INSERT OR IGNORE INTO producer_jobs(request_id,state,enqueued_at,available_at,resume_requested) VALUES(?,'queued',?,?,?)",
            (request_id, now, now, int(resume)),
        ).rowcount
        if not created and resume:
            # Only an explicitly authorized resume may unpark stalled work.
            # Never mutate a currently running claim.
            db.execute("""UPDATE producer_jobs
                SET resume_requested=1,state='queued',consecutive_yields=0,available_at=?
                WHERE request_id=? AND state IN ('queued','paused')""", (now, request_id))
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
    # The HTTP recovery gate does not protect the autonomous dispatcher.
    # Do not read/recover/release any claims while startup is in read-only mode.
    if admission_paused():
        return None
    with _connect() as db:
        _transaction(db)
        if admission_paused():
            db.commit()
            return None
        now = time.time()
        db.execute("""UPDATE producer_jobs
            SET state=CASE WHEN consecutive_yields+1>=? THEN 'paused' ELSE 'queued' END,
                token=NULL, lease_until=NULL,
                consecutive_yields=consecutive_yields+1, available_at=?
            WHERE state='running' AND lease_until < ?""",
            (MAX_CONSECUTIVE_YIELDS, now + 60, now))
        if circuit_open(db):
            db.commit()
            return None
        # Worker autonomous ready-production and Python producers share the
        # same SQLite admission transaction. Without this count, two Cloudflare
        # isolates could fill their own R2 claims while two Python jobs run.
        worker_active = db.execute("""SELECT COUNT(*) FROM resource_leases
            WHERE scope='worker_heavy' AND lease_until>?""", (now,)).fetchone()[0]
        active = (db.execute("SELECT COUNT(*) FROM producer_jobs WHERE state='running'")
                  .fetchone()[0] + worker_active)
        # After a circuit cooldown, probe with one producer before returning to
        # normal concurrency. A successful job finish clears the half-open latch.
        has_outage = db.execute("SELECT 1 FROM governor_control WHERE name='database'").fetchone()
        allowed = 1 if has_outage else max_jobs()
        if active >= allowed:
            db.commit()
            return None
        target = producer_only_recovery_target() if producer_only_recovery_enabled() else "ALL"
        if target == "ALL":
            row = db.execute(
                "SELECT request_id FROM producer_jobs WHERE state='queued' AND available_at<=? "
                "ORDER BY enqueued_at, request_id LIMIT 1", (now,)
            ).fetchone()
        else:
            # Never drain unrelated persisted requests during an exact-ID canary.
            row = db.execute(
                "SELECT request_id FROM producer_jobs WHERE state='queued' AND available_at<=? "
                "AND request_id=? ORDER BY enqueued_at, request_id LIMIT 1", (now, target)
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



# Only the authenticated Cloudflare Ready-production caller may use this scope.
# The browser has no access to the shared secret or these durable leases.
WORKER_HEAVY_SCOPE = "worker_heavy"
WORKER_HEAVY_LEASE_SECONDS = 120
WORKER_HEAVY_LIMIT = 1  # Reserve at least one of the global two slots for Python.


def claim_worker_heavy(idea_id: str, token: str) -> bool:
    """Atomic Worker+Python heavy-job admission, backed by the runner SQLite.

    Refuse on unavailable governor, outage/circuit or duplicate idea owner.
    Excess ideas remain in the Worker's existing R2 durable ready-production queue.
    Repeated requests with the *same* live token are idempotent.
    """
    # Producer-only recovery mode is explicitly for an exact Python
    # canary, not a back door for unrelated autonomous Worker claims.
    if not enabled() or recovery_read_only_active():
        return False
    with _connect() as db:
        _transaction(db)
        now = time.time()
        if recovery_read_only_active() or circuit_open(db):
            db.commit()
            return False
        # Half-open database recovery is Python-only until a canonical
        # producer step proves the store is healthy again.
        if db.execute("SELECT 1 FROM governor_control WHERE name='database'").fetchone():
            db.commit()
            return False
        row = db.execute("""SELECT token,lease_until FROM resource_leases
            WHERE scope=? AND lease_key=?""", (WORKER_HEAVY_SCOPE, idea_id)).fetchone()
        if row and float(row[1]) > now:
            db.commit()
            return row[0] == token
        # Cleanup only expired Worker claims, not other stages' leases.
        db.execute("""DELETE FROM resource_leases
            WHERE scope=? AND lease_until<=?""", (WORKER_HEAVY_SCOPE, now))
        running = db.execute("""SELECT COUNT(*) FROM producer_jobs
            WHERE state='running' AND lease_until>?""", (now,)).fetchone()[0]
        worker_running = db.execute("""SELECT COUNT(*) FROM resource_leases
            WHERE scope=? AND lease_until>?""", (WORKER_HEAVY_SCOPE, now)).fetchone()[0]
        # The half-open recovery latch was checked above. Normal capacity is
        # one shared pool, so a configured cap of 1 must not permanently starve
        # autonomous Ready-production when all Python producers are idle.
        allowed = max_jobs()
        worker_limit = min(WORKER_HEAVY_LIMIT, allowed)
        if allowed == 1:
            # Give runnable Python work priority under the one-job canary cap.
            # Delayed/backoff or parked jobs must not block an idle slot.
            # This read and Worker insertion share the same IMMEDIATE txn as
            # claim_next(), so no second host can claim capacity in between.
            python_ready = db.execute("""SELECT 1 FROM producer_jobs
                WHERE state='queued' AND available_at<=? LIMIT 1""", (now,)).fetchone()
            if python_ready:
                db.commit()
                return False
        else:
            # At two or more slots, keep one available for Python while
            # Worker Ready-production holds at most one global local lease.
            worker_limit = min(worker_limit, allowed - 1)
        if worker_running >= worker_limit or running + worker_running >= allowed:
            db.commit()
            return False
        claimed = db.execute("""INSERT OR IGNORE INTO resource_leases
            (scope,lease_key,token,lease_until) VALUES (?,?,?,?)""",
            (WORKER_HEAVY_SCOPE, idea_id, token, now + WORKER_HEAVY_LEASE_SECONDS),
        ).rowcount
        db.commit()
        return bool(claimed)


def renew_worker_heavy(idea_id: str, token: str) -> bool:
    """An expired or superseded token cannot resurrect a Worker workload."""
    if not enabled() or recovery_read_only_active():
        return False
    now = time.time()
    with _connect() as db:
        if circuit_open(db) or db.execute(
            "SELECT 1 FROM governor_control WHERE name='database'"
        ).fetchone():
            return False
        return bool(db.execute("""UPDATE resource_leases SET lease_until=?
            WHERE scope=? AND lease_key=? AND token=? AND lease_until>?""",
            (now + WORKER_HEAVY_LEASE_SECONDS, WORKER_HEAVY_SCOPE,
             idea_id, token, now),
        ).rowcount)


def release_worker_heavy(idea_id: str, token: str) -> bool:
    """Release only the matching owner, including during outage recovery."""
    if not enabled():
        return False
    with _connect() as db:
        return bool(db.execute("""DELETE FROM resource_leases
            WHERE scope=? AND lease_key=? AND token=?""",
            (WORKER_HEAVY_SCOPE, idea_id, token),
        ).rowcount)


def claimed_resume_requested(request_id: str, token: str) -> bool:
    with _connect() as db:
        row = db.execute("""SELECT resume_requested FROM producer_jobs
            WHERE request_id=? AND state='running' AND token=? AND lease_until>?""",
            (request_id, token, time.time())).fetchone()
    if row is None:
        raise RuntimeError("producer lease not owned")
    return bool(row[0])


def renew_job(request_id: str, token: str) -> bool:
    # A stale heartbeat must never revive an expired claim, even when the
    # dispatcher has not yet noticed its expiry.
    now = time.time()
    with _connect() as db:
        changed = db.execute("""UPDATE producer_jobs SET lease_until=?
            WHERE request_id=? AND state='running' AND token=? AND lease_until>?""",
            (now + LEASE_SECONDS, request_id, token, now),
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
        now = time.time()
        if requeue:
            row = db.execute(
                """SELECT consecutive_yields FROM producer_jobs
                WHERE request_id=? AND token=? AND state='running' AND lease_until>?""",
                (request_id, token, now),
            ).fetchone()
            if row:
                streak = 1 if progressed else int(row[0]) + 1
                parked = streak >= MAX_CONSECUTIVE_YIELDS
                delay = min(MAX_REQUEUE_DELAY_SECONDS, 30 * (2 ** min(streak - 1, 5)))
                db.execute("""UPDATE producer_jobs SET state=?,token=NULL,lease_until=NULL,
                    available_at=?,consecutive_yields=?
                    WHERE request_id=? AND token=? AND state='running' AND lease_until>?""",
                    ("paused" if parked else "queued", now + delay, streak, request_id, token, now))
                if parked:
                    logger.error("producer request=%s paused after repeated no-progress yields", request_id)
        else:
            # Do not delete a durable request if this worker's lease expired.
            # Leave it for bounded crash recovery (even before a new claim).
            deleted = db.execute(
                """DELETE FROM producer_jobs
                WHERE request_id=? AND token=? AND state='running' AND lease_until>?""",
                (request_id, token, now),
            )
            if deleted.rowcount and progressed:
                # Half-open recovery only exits after a governed job has
                # confirmed a new canonical step write. A terminal no-op
                # or a blocked/crashed job cannot certify DB recovery.
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
def image_classification_recovery_window() -> Iterator[None]:
    """Allow A3's own metadata writes only within a globally serialized lease.

    In recovery, only this server-owned context can permit Supabase writes.
    All other stages, dispatchers, worker hosts and provider publishers remain
    blocked by the independent HTTP gate and/or normal database circuit.
    """
    if not enabled() or not (admission_paused() or producer_only_recovery_enabled()):
        yield
        return
    with resource_slot("library_image_classify", limit=1, allow_during_recovery=True):
        token = _A3_METADATA_WRITES.set(True)
        try:
            yield
        finally:
            _A3_METADATA_WRITES.reset(token)


def _process_definitely_exited(pid: int) -> bool:
    """Local host only: unknown, inaccessible and reused live PIDs fail closed."""
    if not isinstance(pid, int) or pid <= 0 or pid == os.getpid():
        return False
    if os.name == "nt":
        # os.kill(pid, 0) is NOT a safe Windows liveness probe.
        # Wait on a process handle with zero timeout, never terminate it.
        import ctypes
        from ctypes import wintypes

        try:
            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
            kernel.WaitForSingleObject.restype = wintypes.DWORD
            kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
            kernel.CloseHandle.restype = wintypes.BOOL
            handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
            if not handle:
                # ERROR_INVALID_PARAMETER: no process with this positive PID.
                # Access denied and every other error are not death evidence.
                return ctypes.get_last_error() == 87
            try:
                return kernel.WaitForSingleObject(handle, 0) == 0
            finally:
                kernel.CloseHandle(handle)
        except (OSError, ValueError, OverflowError):
            return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    except (OSError, ValueError, OverflowError):
        return False
    return False


def _reap_dead_db_owners(db: sqlite3.Connection, scope: str, now: float) -> int:
    """Reclaim only DB slots with positive local process-exit evidence.

    Called within the same SQLite admission transaction. Never reclaim
    media/producer/Worker leases or legacy DB leases lacking owner metadata.
    A reused live PID is conservative: the slot expires normally.
    """
    if scope not in _DB_REQUEST_SCOPES:
        return 0
    rows = db.execute("""SELECT lease_key,token,owner_pid,owner_dead_seen_at
        FROM resource_leases WHERE scope=? AND owner_pid IS NOT NULL""",
        (scope,)).fetchall()
    removed = 0
    for key, token, pid, dead_seen in rows:
        identity = (scope, key, token, pid)
        if not _process_definitely_exited(pid):
            # PID reuse or inconclusive evidence invalidates the observation.
            if dead_seen is not None:
                db.execute("""UPDATE resource_leases SET owner_dead_seen_at=NULL
                    WHERE scope=? AND lease_key=? AND token=? AND owner_pid=?""", identity)
            continue
        if dead_seen is None or dead_seen > now:
            # Start the settling interval at observed death, NOT acquisition.
            db.execute("""UPDATE resource_leases SET owner_dead_seen_at=?
                WHERE scope=? AND lease_key=? AND token=? AND owner_pid=?""",
                (now, *identity))
            continue
        if now - dead_seen >= DB_DEAD_OWNER_GRACE_SECONDS:
            removed += db.execute("""DELETE FROM resource_leases
                WHERE scope=? AND lease_key=? AND token=? AND owner_pid=?""",
                identity).rowcount
    return removed


@contextmanager
def resource_slot(
    scope: str, *, key: str = "", limit: int = 1,
    allow_during_circuit: bool = False, allow_during_recovery: bool = False,
    wait_seconds: float | None = None,
) -> Iterator[None]:
    """Atomic, expiring single-host claims for photo-group and transfer work."""
    if not enabled():
        yield
        return
    recovery_read_allowed = (
        (scope == "supabase_read" and allow_during_circuit)
        or (scope in {"library_image_upload", "library_image_classify"} and allow_during_recovery)
        or (scope == "supabase_write" and _A3_METADATA_WRITES.get())
    )
    if admission_paused() and not recovery_read_allowed:
        raise AdmissionDeferred("runner recovery read-only: resource admission paused")
    token = uuid.uuid4().hex
    lease_key = key or token
    if wait_seconds is None:
        wait_seconds = 30.0 if scope.startswith("supabase_") else 60.0
    deadline = time.monotonic() + max(0.0, wait_seconds)
    while True:
        with _connect() as db:
            _transaction(db)
            now = time.time()
            db.execute("DELETE FROM resource_leases WHERE lease_until < ?", (now,))
            active = db.execute("SELECT COUNT(*) FROM resource_leases WHERE scope=?", (scope,)).fetchone()[0]
            allowed = ((not admission_paused() or recovery_read_allowed)
                       and (allow_during_circuit or not circuit_open(db)))
            reaped = 0
            if allowed and active >= limit and scope in _DB_REQUEST_SCOPES:
                reaped = _reap_dead_db_owners(db, scope, now)
                active -= reaped
            if allowed and active < limit:
                claimed = db.execute("""INSERT OR IGNORE INTO resource_leases
                    (scope,lease_key,token,lease_until,owner_pid) VALUES(?,?,?,?,?)""",
                    (scope, lease_key, token, now + LEASE_SECONDS,
                     os.getpid() if scope in _DB_REQUEST_SCOPES else None)).rowcount
            else:
                claimed = 0
            db.commit()
        if reaped:
            logger.warning("reclaimed %s expired-owner DB resource slot(s): %s", reaped, scope)
        if claimed:
            break
        if time.monotonic() >= deadline:
            raise AdmissionDeferred(f"{scope} admission deferred; capacity or database health unavailable")
        time.sleep(min(DISPATCH_INTERVAL, max(0.0, deadline - time.monotonic())))
    stopped = threading.Event()
    def _renew() -> bool:
        # Never resurrect an expired resource slot; a newer owner may be
        # preparing a fenced retry after cleanup.
        now = time.time()
        with _connect() as db:
            return bool(db.execute("""UPDATE resource_leases SET lease_until=?
                WHERE scope=? AND lease_key=? AND token=? AND lease_until>?""",
                (now + LEASE_SECONDS, scope, lease_key, token, now)).rowcount)
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


def record_db_request(method: str, *, failed: bool, latency_ms: float = 0) -> None:
    if not enabled():
        return
    minute = int(time.time() // 60)
    operation = "read" if method.upper() in {"GET", "HEAD"} else "write"
    with _connect() as db:
        db.execute("""INSERT INTO request_metrics
            (minute,operation,total,failures,latency_total_ms,latency_max_ms)
            VALUES(?,?,1,?,?,?)
            ON CONFLICT(minute,operation) DO UPDATE SET
            total=total+1, failures=failures+excluded.failures,
            latency_total_ms=latency_total_ms+excluded.latency_total_ms,
            latency_max_ms=max(latency_max_ms,excluded.latency_max_ms)""",
            (minute, operation, int(failed), max(0.0, latency_ms), max(0.0, latency_ms)))
        # Keep only 30 minutes of local counters (no request payloads or IDs).
        db.execute("DELETE FROM request_metrics WHERE minute<?", (minute - 30,))


def snapshot() -> dict[str, object]:
    if not enabled():
        return {"enabled": False, "recovery_read_only": admission_paused(), "admission_paused": admission_paused()}
    with _connect() as db:
        counts = db.execute("SELECT state,COUNT(*) FROM producer_jobs GROUP BY state").fetchall()
        groups = db.execute("""SELECT COUNT(*) FROM resource_leases
            WHERE scope='photo_group' AND lease_until>?""", (time.time(),)).fetchone()[0]
        queued = dict(counts)
        now = time.time()
        worker_heavy = db.execute("""SELECT COUNT(*) FROM resource_leases
            WHERE scope=? AND lease_until>?""",
            (WORKER_HEAVY_SCOPE, now)).fetchone()[0]
        active_resources = dict(db.execute("""SELECT scope, COUNT(*)
            FROM resource_leases WHERE lease_until>?
            GROUP BY scope""", (now,)).fetchall())
        permitted_resource_names = (
            "photo_group", "ratio", "transfer", "supabase_read",
            "supabase_write", "worker_heavy", "library_image_upload",
            "library_image_classify", "smv1_drain",
        )
        active_resources = {
            scope: int(active_resources.get(scope, 0))
            for scope in permitted_resource_names
        }
        circuit_row = db.execute("""SELECT until_at FROM governor_control
            WHERE name='database'""").fetchone()
        circuit_phase = (
            "open" if circuit_row and float(circuit_row[0]) > now
            else "half_open" if circuit_row else "closed"
        )
        history_rows = db.execute("""SELECT minute, operation, total, failures,
            latency_total_ms, latency_max_ms
            FROM request_metrics WHERE minute>=?
            ORDER BY minute DESC, operation LIMIT 60""",
            (int(now // 60) - 29,),
        ).fetchall()
        history = [
            {
                "minute_epoch": int(minute),
                "operation": operation,
                "requests": int(total),
                "failures": int(failed),
                "mean_latency_ms": round(total_ms / max(1, total), 1),
                "max_latency_ms": round(max_ms, 1),
            }
            for minute, operation, total, failed, total_ms, max_ms in history_rows
        ]
        rows = db.execute("""SELECT operation,SUM(total),SUM(failures),
            SUM(latency_total_ms),MAX(latency_max_ms)
            FROM request_metrics WHERE minute>=? GROUP BY operation""",
            (int(time.time() // 60)-1,)).fetchall()
        traffic = {
            operation: {
                "requests_last_two_minutes": total,
                "failures_last_two_minutes": failed,
                "mean_latency_ms": round(total_ms / max(1, total), 1),
                "max_latency_ms": round(max_ms, 1),
            }
            for operation, total, failed, total_ms, max_ms in rows
        }
        return {
            "enabled": True, "scope": "single_windows_host",
            "recovery_read_only": admission_paused(),
            "admission_paused": admission_paused() or circuit_open(db),
            "active_jobs": queued.get("running", 0),
            "active_worker_heavy": worker_heavy,
            "combined_heavy_active": queued.get("running", 0) + worker_heavy,
            "worker_heavy_limit": WORKER_HEAVY_LIMIT,
            "queued_jobs": queued.get("queued", 0), "paused_jobs": queued.get("paused", 0),
            "active_photo_groups": groups,
            "max_jobs": max_jobs(), "max_photo_groups": max_photo_groups(),
            "max_ratio_workers": max_ratio_workers(), "database_circuit_open": circuit_open(db),
            "database_circuit_phase": circuit_phase,
            "database_circuit_until_epoch": float(circuit_row[0]) if circuit_row else None,
            "active_resource_slots": active_resources,
            "max_db_reads": max_db_reads(), "max_db_writes": max_db_writes(),
            "supabase_request_metrics": traffic,
            "runner_request_history": history,  # Last 30 min; runner REST only.
            "last_recovery": None,  # No durable recovery event ledger exists yet.
            "last_admission_decisions": None,  # Do not invent history.
        }


def ensure_dispatcher(worker: Callable[[str, str], None]) -> None:
    global _dispatch_started
    if not enabled():
        return
    # Fail synchronously if the persistent coordination store is unavailable.
    # Never start a thread that logs storage errors every two seconds forever.
    with _connect() as db:
        db.execute("SELECT 1")
    # Deliberate staging mode: initialize durable store for diagnostics but
    # start NO background dispatcher until recovery mode is removed and the
    # service restarted. Even an old queue must not auto-resume during recovery.
    if admission_paused():
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
