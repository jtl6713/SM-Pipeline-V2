"""Incident #2670: hermetic durable runner admission and resource claims."""
import threading
import time

import pytest
from studio_produce import workload_governor as gov


@pytest.fixture
def isolated_governor(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "governor.sqlite3"))
    monkeypatch.setenv("STUDIO_MAX_PRODUCER_JOBS", "2")
    monkeypatch.delenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", raising=False)
    monkeypatch.setattr(gov, "DISPATCH_INTERVAL", 0.01)
    return gov


def test_duplicate_request_is_enqueued_once_and_excess_is_durable(isolated_governor):
    g = isolated_governor
    assert g.enqueue("recA") is True
    assert g.enqueue("recA") is False
    assert g.enqueue("recB") is True
    assert g.enqueue("recC") is True
    first = g.claim_next()
    second = g.claim_next()
    assert {first[0], second[0]} == {"recA", "recB"}
    assert g.claim_next() is None
    assert g.snapshot()["queued_jobs"] == 1
    assert g.snapshot()["active_jobs"] == 2
    g.finish_job(*first)
    third = g.claim_next()
    assert third[0] == "recC"
    assert len({first[1], second[1], third[1]}) == 3


def test_crash_expiry_releases_claim_but_not_the_request(isolated_governor):
    g = isolated_governor
    g.enqueue("recA")
    request_id, token = g.claim_next()
    with g._connect() as db:
        db.execute("UPDATE producer_jobs SET lease_until=0 WHERE request_id=?", (request_id,))
    assert g.claim_next() is None  # Crashed owners must not immediately storm the DB.
    with g._connect() as db:
        db.execute("UPDATE producer_jobs SET available_at=0 WHERE request_id=?", (request_id,))
    new_claim = g.claim_next()
    assert new_claim is not None and new_claim[0] == request_id
    assert new_claim[1] != token
    assert not g.renew_job(request_id, token)
    assert g.job_valid(request_id, new_claim[1])
    g.finish_job(request_id, token)
    assert g.job_valid(request_id, new_claim[1])



def test_expired_producer_cannot_revive_or_remove_durable_request(isolated_governor):
    g = isolated_governor
    assert g.enqueue("recExpired")
    request_id, token = g.claim_next()
    with g._connect() as db:
        db.execute("UPDATE producer_jobs SET lease_until=0 WHERE request_id=?", (request_id,))
    # The old owner must not renew, delete, or requeue an expired claim,
    # even if the dispatcher has not yet performed crash recovery.
    assert g.renew_job(request_id, token) is False
    g.finish_job(request_id, token, progressed=True)
    with g._connect() as db:
        state = db.execute(
            "SELECT state,token FROM producer_jobs WHERE request_id=?", (request_id,)
        ).fetchone()
    assert state == ("running", token)
    assert g.claim_next() is None  # Expired claim becomes delayed, durable queue entry.
    assert g.snapshot()["queued_jobs"] == 1
    with g._connect() as db:
        db.execute("UPDATE producer_jobs SET available_at=0 WHERE request_id=?", (request_id,))
    new_request, new_token = g.claim_next()
    assert new_request == request_id and new_token != token
    g.finish_job(request_id, token, requeue=True)  # Cannot rewrite the new claim.
    assert g.job_valid(new_request, new_token)
    g.finish_job(new_request, new_token)


def test_expired_media_slot_cannot_be_reanimated_by_heartbeat(
    isolated_governor, monkeypatch,
):
    g = isolated_governor
    monkeypatch.setattr(g, "HEARTBEAT_INTERVAL", 0.01)
    with g.resource_slot("photo_group", key="recMedia", limit=1):
        with g._connect() as db:
            db.execute(
                "UPDATE resource_leases SET lease_until=0 "
                "WHERE scope='photo_group' AND lease_key='recMedia'"
            )
        # The background heartbeat runs but must not renew an already
        # expired slot. A new process is free to claim it after cleanup.
        time.sleep(0.08)
        assert not g.resource_active("photo_group", "recMedia")
    with g.resource_slot("photo_group", key="recMedia", limit=1):
        assert g.resource_active("photo_group", "recMedia")


def test_circuit_blocks_new_heavy_jobs_without_discarding_queue(isolated_governor):
    g = isolated_governor
    g.enqueue("recA")
    g.trip_database_circuit(cooldown_seconds=30)
    assert g.claim_next() is None
    assert g.snapshot()["database_circuit_open"] is True
    assert g.snapshot()["queued_jobs"] == 1
    with g._connect() as db:
        db.execute("UPDATE governor_control SET until_at=0 WHERE name='database'")
    g.enqueue("recB")
    half_open = g.claim_next()
    assert half_open[0] == "recA"
    assert g.claim_next() is None  # half-open admits one canary, not two
    with g.resource_slot("supabase_read", limit=2, allow_during_circuit=True):
        pass
    g.finish_job(*half_open)  # terminal no-op is NOT successful recovery proof
    g.enqueue("recC")
    second_probe = g.claim_next()
    assert second_probe[0] == "recB"
    assert g.claim_next() is None  # still half-open, despite available second slot
    g.finish_job(*second_probe, progressed=True)
    assert g.claim_next()[0] == "recC"


def test_transfer_claim_cross_thread_single_flight(isolated_governor):
    g = isolated_governor
    visited = []
    obtained = threading.Event()

    def second():
        with g.resource_slot("transfer", key="recTransfer", limit=1):
            visited.append("second")
            obtained.set()

    with g.resource_slot("transfer", key="recTransfer", limit=1):
        assert g.resource_active("transfer", "recTransfer")
        t = threading.Thread(target=second, daemon=True)
        t.start()
        time.sleep(0.07)
        assert not obtained.is_set()
    t.join(timeout=3)
    assert obtained.is_set()
    assert visited == ["second"]
    assert not g.resource_active("transfer", "recTransfer")


def test_overload_classification(isolated_governor):
    assert gov.is_database_overload(RuntimeError("Supabase PATCH failed 522"))
    assert gov.is_database_overload(RuntimeError("Connection terminated due to connection timeout"))
    assert not gov.is_database_overload(RuntimeError("Image generator returned 404"))


def test_snapshot_reports_no_request_id_or_credentials(isolated_governor):
    g = isolated_governor
    g.enqueue("recSecretID")
    g.record_db_request("GET", failed=False)
    g.record_db_request("POST", failed=True)
    status = g.snapshot()
    assert status["max_jobs"] == 2
    assert status["max_db_reads"] >= 1
    assert status["supabase_request_metrics"]["read"]["requests_last_two_minutes"] >= 1
    assert "recSecretID" not in str(status)


def test_missing_durable_path_fails_closed(isolated_governor, monkeypatch):
    monkeypatch.delenv("STUDIO_GOVERNOR_DB_PATH")
    with pytest.raises(RuntimeError, match="STUDIO_GOVERNOR_DB_PATH"):
        isolated_governor.enqueue("recX")


def test_no_progress_yields_are_backed_off_and_parked(isolated_governor):
    g = isolated_governor
    assert g.enqueue("recStalled")
    for i in range(g.MAX_CONSECUTIVE_YIELDS):
        claimed = g.claim_next()
        assert claimed and claimed[0] == "recStalled"
        g.finish_job(*claimed, requeue=True)
        assert g.claim_next() is None
        if i < g.MAX_CONSECUTIVE_YIELDS - 1:
            with g._connect() as db:
                db.execute("UPDATE producer_jobs SET available_at=0 WHERE request_id='recStalled'")
    assert g.snapshot()["paused_jobs"] == 1
    assert g.snapshot()["queued_jobs"] == 0
    assert g.enqueue("recStalled") is False
    assert g.snapshot()["paused_jobs"] == 1
    assert g.enqueue("recStalled", resume=True) is False
    assert g.snapshot()["paused_jobs"] == 0
    restarted = g.claim_next()
    assert restarted and restarted[0] == "recStalled"
    assert g.claimed_resume_requested(*restarted) is True


def test_governed_start_never_mutates_before_claim(isolated_governor, monkeypatch):
    from studio_produce import processor
    class Client:
        def update_record(self, *_args, **_kwargs):
            raise AssertionError("canonical write happened before durable admission")
    monkeypatch.setattr(processor, "AirtableClient", Client)
    monkeypatch.setattr(processor, "load_request", lambda *_: {"id": "recPreflight", "fields": {}})
    monkeypatch.setattr(processor, "read_job", lambda *_: {"job_id": "spj-test", "step": "themes"})
    monkeypatch.setattr(gov, "ensure_dispatcher", lambda *_: None)
    result = processor.start_job("recPreflight", resume=True)
    assert result["accepted"] and result["queued"]
    claim = isolated_governor.claim_next()
    assert claim and claim[0] == "recPreflight"
    assert gov.claimed_resume_requested(*claim) is True


def test_governed_outage_retains_job_without_marking_blocked(isolated_governor, monkeypatch):
    from studio_produce import processor
    from contextlib import contextmanager
    @contextmanager
    def no_thread_heartbeat(*_args):
        yield threading.Event()

    g = isolated_governor
    g.enqueue("recOutage")
    claim = g.claim_next()
    monkeypatch.setattr(g, "job_heartbeat", no_thread_heartbeat)
    monkeypatch.setattr(processor, "start_job", lambda *_args, **_kwargs: {"accepted": True})
    monkeypatch.setattr(processor, "_run", lambda *_args, **_kwargs: (
        (_ for _ in ()).throw(RuntimeError("Supabase PATCH failed 522"))
    ))
    processor._run_governed(*claim)
    assert g.snapshot()["queued_jobs"] == 1
    assert g.snapshot()["active_jobs"] == 0
    assert g.snapshot()["database_circuit_open"] is True



def test_read_only_mode_preserves_queued_jobs_without_dispatch(isolated_governor, monkeypatch):
    g = isolated_governor
    assert g.enqueue("recHeld") is True
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    assert g.claim_next() is None
    snapshot = g.snapshot()
    assert snapshot["enabled"] and snapshot["recovery_read_only"]
    assert snapshot["admission_paused"] is True
    assert snapshot["queued_jobs"] == 1
    assert snapshot["active_jobs"] == 0
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "false")
    claimed = g.claim_next()
    assert claimed and claimed[0] == "recHeld"


def test_read_only_mode_blocks_media_and_write_slots_but_preserves_bounded_reads(
    isolated_governor, monkeypatch,
):
    g = isolated_governor
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    for resource in ("photo_group", "transfer", "supabase_write"):
        with pytest.raises(g.AdmissionDeferred, match="read-only"):
            with g.resource_slot(resource, limit=2):
                raise AssertionError("resource unexpectedly admitted")
    with g.resource_slot("supabase_read", limit=2, allow_during_circuit=True):
        pass
    assert g.snapshot()["active_photo_groups"] == 0


def test_read_only_mode_initializes_store_without_starting_dispatcher(
    isolated_governor, monkeypatch,
):
    g = isolated_governor
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "1")
    monkeypatch.setattr(g, "_dispatch_started", False)
    called = []
    g.ensure_dispatcher(lambda *_args: called.append("started"))
    assert g.snapshot()["enabled"] is True
    assert g._dispatch_started is False
    assert called == []


def test_worker_and_python_share_global_two_job_limit(isolated_governor):
    import uuid
    g = isolated_governor
    g.enqueue("recPythonOne")
    g.enqueue("recPythonTwo")
    first = g.claim_next()
    assert first and first[0] == "recPythonOne"
    idea = "rec" + "A" * 14
    token = str(uuid.uuid4())
    assert g.claim_worker_heavy(idea, token) is True
    assert g.claim_worker_heavy(idea, token) is True  # Idempotent retry.
    assert g.claim_worker_heavy(idea, str(uuid.uuid4())) is False
    assert g.claim_next() is None  # Worker occupies the second global slot.
    snap = g.snapshot()
    assert snap["active_jobs"] == 1
    assert snap["active_worker_heavy"] == 1
    assert snap["combined_heavy_active"] == 2
    assert snap["queued_jobs"] == 1
    assert g.release_worker_heavy(idea, str(uuid.uuid4())) is False
    assert g.claim_next() is None  # Wrong-token release didn't free capacity.
    assert g.release_worker_heavy(idea, token) is True
    second = g.claim_next()
    assert second and second[0] == "recPythonTwo"


def test_worker_lease_expiry_and_fenced_token_recovery(isolated_governor):
    import uuid
    g = isolated_governor
    idea = "rec" + "B" * 14
    old_token, next_token = str(uuid.uuid4()), str(uuid.uuid4())
    assert g.claim_worker_heavy(idea, old_token)
    with g._connect() as db:
        db.execute(
            "UPDATE resource_leases SET lease_until=0 WHERE scope=? AND lease_key=?",
            (g.WORKER_HEAVY_SCOPE, idea),
        )
    assert g.renew_worker_heavy(idea, old_token) is False
    assert g.claim_worker_heavy(idea, next_token)
    assert g.release_worker_heavy(idea, old_token) is False
    assert g.renew_worker_heavy(idea, next_token) is True
    assert g.release_worker_heavy(idea, next_token) is True


def test_worker_claims_pause_on_circuit_half_open_and_one_job_canary(isolated_governor):
    import uuid
    g = isolated_governor
    idea = "rec" + "C" * 14
    token = str(uuid.uuid4())
    assert g.enqueue("recCanary")
    g.trip_database_circuit(cooldown_seconds=90)
    assert not g.claim_worker_heavy(idea, token)
    with g._connect() as db:
        db.execute("UPDATE governor_control SET until_at=0 WHERE name='database'")
    # Cooldown alone is not a proof of database recovery: Python-only canary.
    assert not g.claim_worker_heavy(idea, token)
    job = g.claim_next()
    assert job and job[0] == "recCanary"
    assert g.claim_next() is None
    g.finish_job(*job, progressed=True)
    assert g.claim_worker_heavy(idea, token)
    assert g.release_worker_heavy(idea, token)


def test_worker_claims_are_atomic_across_competing_threads(isolated_governor):
    import uuid
    g = isolated_governor
    barrier = threading.Barrier(8)
    admitted = []
    errors = []
    lock = threading.Lock()

    def compete(i):
        try:
            barrier.wait(timeout=4)
            granted = g.claim_worker_heavy(
                "rec" + f"{i:014d}",
                str(uuid.uuid4()),
            )
            with lock:
                admitted.append(granted)
        except Exception as exc:
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=compete, args=(i,)) for i in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=8)
    assert not errors
    assert len(admitted) == 8
    assert admitted.count(True) == 1
    assert g.snapshot()["combined_heavy_active"] == 1


def test_authenticated_remote_worker_broker_denies_invalid_and_recovery_claims(
    isolated_governor, monkeypatch,
):
    import uuid
    from app import app, settings
    monkeypatch.setitem(settings, "pipeline_runner_shared_secret", "test-shared-broker-secret")
    idea, token = "rec" + "D" * 14, str(uuid.uuid4())
    with app.test_client() as client:
        payload = {"action": "claim", "idea_id": idea, "token": token}
        assert client.post("/internal/workload/worker-lease", json=payload).status_code == 401
        headers = {"X-Pipeline-Secret": "test-shared-broker-secret"}
        assert client.post(
            "/internal/workload/worker-lease", json={**payload, "extra": "unsafe"},
            headers=headers,
        ).status_code == 422
        claimed = client.post("/internal/workload/worker-lease", json=payload, headers=headers)
        assert claimed.status_code == 200 and claimed.json["admitted"] is True
        assert client.post(
            "/internal/workload/worker-lease",
            json={**payload, "token": str(uuid.uuid4())}, headers=headers,
        ).status_code == 429
        monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
        assert client.post(
            "/internal/workload/worker-lease", json=payload, headers=headers,
        ).status_code == 503
        # A release cannot resume production, so it is allowed while frozen.
        released = client.post(
            "/internal/workload/worker-lease",
            json={**payload, "action": "release"}, headers=headers,
        )
        assert released.status_code == 200 and released.json["released"] is True
        assert isolated_governor.snapshot()["active_worker_heavy"] == 0



def test_bounded_workload_dashboard_snapshot_has_real_runner_metrics(isolated_governor):
    g = isolated_governor
    g.enqueue("recSensitiveWork")
    g.record_db_request("GET", failed=False, latency_ms=41)
    g.record_db_request("PATCH", failed=True, latency_ms=120)
    status = g.snapshot()
    assert status["queued_jobs"] == 1
    assert status["database_circuit_phase"] == "closed"
    assert status["active_resource_slots"]["transfer"] == 0
    history = status["runner_request_history"]
    assert any(row["operation"] == "read" and row["requests"] == 1 for row in history)
    assert any(row["operation"] == "write" and row["failures"] == 1 for row in history)
    assert len(history) <= 60
    assert status["last_recovery"] is None
    assert status["last_admission_decisions"] is None
    assert "recSensitiveWork" not in str(status)


def test_workload_history_reflects_actual_circuit_without_fabricating_recovery(
    isolated_governor,
):
    g = isolated_governor
    g.trip_database_circuit(cooldown_seconds=90)
    status = g.snapshot()
    assert status["database_circuit_phase"] == "open"
    assert status["admission_paused"] is True
    with g._connect() as db:
        db.execute("UPDATE governor_control SET until_at=0 WHERE name='database'")
    status = g.snapshot()
    assert status["database_circuit_phase"] == "half_open"
    assert status["database_circuit_until_epoch"] == 0
    assert status["last_recovery"] is None


def test_authenticated_workload_snapshot_never_admits_or_mutates_jobs(
    isolated_governor, monkeypatch,
):
    from app import app, settings
    g = isolated_governor
    g.enqueue("recPersistentWork")
    monkeypatch.setitem(settings, "pipeline_runner_shared_secret", "test-diagnostics-secret")
    with app.test_client() as client:
        assert client.get("/internal/workload/snapshot").status_code == 401
        response = client.get("/internal/workload/snapshot", headers={
            "X-Pipeline-Secret": "test-diagnostics-secret",
        })
        assert response.status_code == 200
        assert response.json["ok"] is True
        assert response.json["queued_jobs"] == 1
        assert response.json["active_jobs"] == 0
        assert response.headers["Cache-Control"] == "private, no-store"
    assert g.snapshot()["queued_jobs"] == 1
    assert g.snapshot()["active_jobs"] == 0


def test_cap_one_idle_worker_can_run_without_raising_global_limit(
    isolated_governor, monkeypatch,
):
    """An empty Python queue must not permanently starve Ready-production."""
    import uuid
    g = isolated_governor
    monkeypatch.setenv("STUDIO_MAX_PRODUCER_JOBS", "1")
    idea, token = "rec" + "E" * 14, str(uuid.uuid4())
    assert g.claim_worker_heavy(idea, token) is True
    assert g.snapshot()["max_jobs"] == 1
    assert g.snapshot()["combined_heavy_active"] == 1
    assert g.claim_worker_heavy(idea, token) is True  # Same owner idempotent.
    assert g.claim_worker_heavy("rec" + "F" * 14, str(uuid.uuid4())) is False
    assert g.enqueue("recPythonAfterWorker") is True
    assert g.claim_next() is None  # Shared global ceiling is still one.
    assert g.release_worker_heavy(idea, str(uuid.uuid4())) is False
    assert g.claim_next() is None  # Wrong-token release preserves fencing.
    assert g.release_worker_heavy(idea, token) is True
    claimed = g.claim_next()
    assert claimed and claimed[0] == "recPythonAfterWorker"
    assert g.claim_worker_heavy(idea, str(uuid.uuid4())) is False
    g.finish_job(*claimed)


def test_cap_one_runnable_python_gets_priority_but_delayed_work_does_not(
    isolated_governor, monkeypatch,
):
    """Prioritize immediately runnable Python work without blocking idle slots."""
    import uuid
    g = isolated_governor
    monkeypatch.setenv("STUDIO_MAX_PRODUCER_JOBS", "1")
    idea, owner = "rec" + "G" * 14, str(uuid.uuid4())
    assert g.enqueue("recPythonQueued")
    assert g.claim_worker_heavy(idea, owner) is False
    assert g.snapshot()["queued_jobs"] == 1
    # No side effects: the still-queued Python job is on backoff until later.
    with g._connect() as db:
        db.execute(
            "UPDATE producer_jobs SET available_at=? WHERE request_id=?",
            (time.time() + 300, "recPythonQueued"),
        )
    assert g.claim_worker_heavy(idea, owner) is True
    assert g.claim_next() is None  # Backoff is preserved, not drained.
    assert g.snapshot()["queued_jobs"] == 1
    assert g.release_worker_heavy(idea, owner)
    with g._connect() as db:
        db.execute(
            "UPDATE producer_jobs SET available_at=0 WHERE request_id=?",
            ("recPythonQueued",),
        )
    result = g.claim_next()
    assert result and result[0] == "recPythonQueued"
    g.finish_job(*result)


def test_cap_one_python_only_emergency_canary_never_opens_worker_ingress(
    isolated_governor, monkeypatch,
):
    """Even if recovery producer-only admits Python, Worker stays frozen."""
    import uuid
    g = isolated_governor
    monkeypatch.setenv("STUDIO_MAX_PRODUCER_JOBS", "1")
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY", "true")
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET", "recCanarySafe")
    assert g.producer_only_recovery_enabled() is True
    assert g.admission_paused() is False
    idea, token = "rec" + "H" * 14, str(uuid.uuid4())
    assert g.claim_worker_heavy(idea, token) is False
    assert g.renew_worker_heavy(idea, token) is False
    assert g.enqueue("recCanarySafe")
    claimed = g.claim_next()
    assert claimed and claimed[0] == "recCanarySafe"
    assert g.snapshot()["active_worker_heavy"] == 0
    g.finish_job(*claimed)


def test_enabled_global_rpc_denial_requeues_before_canonical_producer_write(
    isolated_governor, monkeypatch,
):
    from studio_produce import processor
    from studio_produce import global_coordinator
    from contextlib import contextmanager

    g = isolated_governor
    g.enqueue("recGlobalDenied")
    claimed = g.claim_next()
    assert claimed and claimed[0] == "recGlobalDenied"

    @contextmanager
    def denied(_request_id):
        raise global_coordinator.GlobalAdmissionUnavailable(
            "global_workload_capacity_denied")
        yield  # pragma: no cover — context manager protocol

    monkeypatch.setattr(global_coordinator, "producer_lease", denied)
    monkeypatch.setattr(processor, "start_job", lambda *args, **kwargs: (
        (_ for _ in ()).throw(AssertionError("canonical preparation before global admission"))
    ))
    processor._run_governed(*claimed)
    assert g.snapshot()["queued_jobs"] == 1
    assert g.snapshot()["active_jobs"] == 0
    assert g.snapshot()["paused_jobs"] == 0


def test_global_producer_lease_loss_requeues_without_claiming_recovery_success(
    isolated_governor, monkeypatch,
):
    from studio_produce import processor, global_coordinator
    from contextlib import contextmanager

    g = isolated_governor
    g.enqueue("recGlobalLost")
    claimed = g.claim_next()
    assert claimed
    lost = threading.Event()
    advanced = []

    class FakeGlobalGuard:
        def __init__(self):
            self.lost = lost
        def mark_progress(self):
            advanced.append(True)

    @contextmanager
    def grant(_request_id):
        yield FakeGlobalGuard()

    monkeypatch.setattr(global_coordinator, "producer_lease", grant)
    monkeypatch.setattr(processor, "start_job", lambda *a, **kw: {"accepted": True})
    def lost_during_step(*args, **kwargs):
        lost.set()
        return "completed_progressed"
    monkeypatch.setattr(processor, "_run", lost_during_step)
    processor._run_governed(*claimed)
    assert advanced == []  # A stale global owner cannot clear the root circuit.
    status = g.snapshot()
    assert status["active_jobs"] == 0
    assert status["queued_jobs"] == 1
    assert status["paused_jobs"] == 0
