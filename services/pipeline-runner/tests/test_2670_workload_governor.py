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
