"""Outage recovery guard: no mutation or worker launch from HTTP while paused."""
import app as runner_app


def test_recovery_gate_blocks_production_before_any_db_work(monkeypatch):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setattr(runner_app, "start_job", lambda *_a, **_k: (_ for _ in ()).throw(
        AssertionError("production started despite recovery gate")
    ))
    client = runner_app.app.test_client()
    result = client.post("/jobs/studio-produce", json={
        "production_request_record_id": "recFakeForTest123",
    })
    assert result.status_code == 503
    assert result.json["error"] == "runner_recovery_read_only"
    assert result.headers["Retry-After"] == "120"


def test_recovery_gate_blocks_other_mutating_verbs_and_stage_posts(monkeypatch):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "1")
    client = runner_app.app.test_client()
    for verb in ("post", "put", "patch", "delete"):
        response = getattr(client, verb)("/stages/i1", json={})
        assert response.status_code == 503
        assert response.json["error"] == "runner_recovery_read_only"


def test_read_only_health_is_available_during_recovery(monkeypatch):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "yes")
    client = runner_app.app.test_client()
    result = client.get("/health")
    assert result.status_code == 200
    assert result.json["ok"] is True
    assert result.json["recovery_read_only"] is True


def test_recovery_gate_is_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", raising=False)
    assert runner_app.recovery_read_only() is False
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "false")
    assert runner_app.recovery_read_only() is False
