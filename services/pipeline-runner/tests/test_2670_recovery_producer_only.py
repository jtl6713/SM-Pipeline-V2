"""Incident 2670: permit bounded production WITHOUT reopening provider dispatch."""
import app as runner
from studio_produce import workload_governor as governor


CANARY = "recProducerCanary123"
OTHER = "recAnotherRequest456"


def setup_recovery(monkeypatch, tmp_path):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY", "true")
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET", CANARY)
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "recovery-governor.sqlite"))
    monkeypatch.setenv("STUDIO_MAX_PRODUCER_JOBS", "1")
    for key in ("I1_DURABLE_ENABLED", "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED",
                "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED"):
        monkeypatch.setenv(key, "false")
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    return runner.app.test_client()


def test_exact_production_canary_without_publisher_unpause(monkeypatch, tmp_path):
    client = setup_recovery(monkeypatch, tmp_path)
    started = []
    monkeypatch.setattr(runner, "start_job", lambda request_id, resume=False: (
        started.append((request_id, resume)) or {
            "accepted": True, "queued": True, "job": {},
            "production_request_record_id": request_id,
        }
    ))
    headers = {"X-Pipeline-Secret": "test-secret"}
    ok = client.post("/jobs/studio-produce",
        json={"production_request_record_id": CANARY}, headers=headers)
    assert ok.status_code == 202
    assert started == [(CANARY, False)]
    assert client.get("/health").json["recovery_read_only"] is True
    assert client.get("/health").json["recovery_producer_scope"] == "exact_request"
    for path in ("/jobs/studio-produce", "/jobs/studio-produce/resume"):
        blocked = client.post(path,
            json={"production_request_record_id": OTHER}, headers=headers)
        assert blocked.status_code == 503
    for path in ("/stages/ap0", "/stages/fb2", "/stages/a4",
                 "/stages/smv1/drain", "/jobs/i1-durable"):
        blocked = client.post(path, json={}, headers=headers)
        assert blocked.status_code == 503, path
    assert client.post("/jobs/studio-produce",
        json={"production_request_record_id": CANARY}).status_code == 401
    assert started == [(CANARY, False)]


def test_recovery_producer_toggle_fails_closed_without_target_or_governor(monkeypatch, tmp_path):
    client = setup_recovery(monkeypatch, tmp_path)
    headers = {"X-Pipeline-Secret": "test-secret"}
    for key, value in (
        ("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET", ""),
        ("PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY", "false"),
        ("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "false"),
        ("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED", "true"),
    ):
        before = __import__("os").environ[key]
        monkeypatch.setenv(key, value)
        r = client.post("/jobs/studio-produce",
            json={"production_request_record_id": CANARY}, headers=headers)
        assert r.status_code == 503
        monkeypatch.setenv(key, before)


def test_governor_does_not_claim_old_unrelated_queue_in_exact_canary(monkeypatch, tmp_path):
    setup_recovery(monkeypatch, tmp_path)
    assert governor.producer_only_recovery_enabled()
    assert not governor.admission_paused()
    governor.enqueue(OTHER)
    governor.enqueue(CANARY)
    claimed = governor.claim_next()
    assert claimed is not None and claimed[0] == CANARY
    # An older, unrelated pending request must never be auto-admitted.
    assert governor.claim_next() is None


def test_all_mode_still_keeps_publisher_gate_and_producer_cap(monkeypatch, tmp_path):
    client = setup_recovery(monkeypatch, tmp_path)
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET", "ALL")
    assert governor.producer_only_recovery_enabled()
    assert client.get("/health").json["recovery_producer_scope"] == "all_governed_requests"
    for path in ("/stages/ap1c", "/stages/ap0", "/stages/a4"):
        r = client.post(path, json={"production_request_record_id": OTHER},
            headers={"X-Pipeline-Secret": "test-secret"})
        assert r.status_code == 503
    governor.enqueue(OTHER)
    governor.enqueue(CANARY)
    first = governor.claim_next()
    assert first is not None
    assert governor.claim_next() is None  # global configured cap = 1
