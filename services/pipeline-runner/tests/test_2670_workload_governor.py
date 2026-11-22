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
    g.finish_job(*half_open)
    assert g.claim_next()[0] == "recB"


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
