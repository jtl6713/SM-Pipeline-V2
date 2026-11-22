"""Incident 2670: nonpublishing manual media work must never unpause provider routes."""
from contextlib import contextmanager

import pytest

import app as runner
from config import StageResult
from studio_produce import workload_governor as governor


@pytest.fixture
def client(monkeypatch, tmp_path):
    for name,value in {
        "PIPELINE_RUNNER_RECOVERY_READ_ONLY": "true",
        "PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY": "true",
        "PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET": "ALL",
        "STUDIO_WORKLOAD_GOVERNOR_ENABLED": "true",
        "STUDIO_GOVERNOR_DB_PATH": str(tmp_path / "governor.sqlite"),
        "I1_DURABLE_ENABLED": "false",
        "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED": "false",
        "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED": "false",
    }.items():
        monkeypatch.setenv(name,value)
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    calls=[]
    @contextmanager
    def lease(name, **kwargs):
        assert name == "recovery_media_stage"
        assert kwargs == {"limit":1}
        calls.append("lease-start")
        try:
            yield
        finally:
            calls.append("lease-finish")
    monkeypatch.setattr(governor, "resource_slot", lease)
    def handler(name):
        return lambda body: (calls.append((name, body.to_dict())) or StageResult(
            stage=name, status="ok", message="synthetic nonpublishing stage"
        ))
    monkeypatch.setattr(runner, "get_handler", handler)
    return runner.app.test_client(),calls


@pytest.mark.parametrize("stage,field", [
    ("smv1","production_request_record_id"),
    ("r2","output_record_id"),
    ("r3","output_record_id"),
    ("r4","output_record_id"),
    ("r5","output_record_id"),
])
def test_exact_nonpublishing_media_uses_single_crossprocess_lease(client, stage, field):
    c,calls=client
    response=c.post(f"/stages/{stage}",json={field:"recOutputTest123", "extra":{"max_runs":1}},
        headers={"X-Pipeline-Secret":"test-secret"})
    assert response.status_code==200, response.get_json()
    assert response.get_json()["stage"]==stage
    assert calls[0]=="lease-start" and calls[-1]=="lease-finish"
    args=calls[1][1]
    assert args["extra"]["max_runs"]==1
    if stage=="smv1":
        assert args["extra"]["photo_workers"]==1


def test_recovery_stage_without_auth_is_not_accessible(client):
    c,_=client
    response=c.post("/stages/r4",json={"output_record_id":"recOutputTest123"})
    assert response.status_code==401


@pytest.mark.parametrize("stage", [
    "fb0","fb1","fb2","ttd0","ttd1","ttd4","yt0","yts1",
    "ap0","ap1c","ap1_igs","c6","c8","c9","publish_fb","publish_ig","publish_yt",
    "a4","i1","i2","p1",
])
def test_publisher_and_other_mutating_stages_remain_fenced(client,stage):
    c,calls=client
    r=c.post(f"/stages/{stage}",json={"output_record_id":"recOutputTest123"},
             headers={"X-Pipeline-Secret":"test-secret"})
    assert r.status_code==503
    assert not calls


@pytest.mark.parametrize("payload", [
    {},
    {"output_record_id":"bad"},
    {"output_record_id":"recOutputTest123","extra":{"max_runs":2}},
    {"output_record_id":"recOutputTest123","extra":{"async_master_recovery":True}},
    {"output_record_id":"recOutputTest123","extra":{"max_runs":True}},
    {"output_record_id":"recOutputTest123","production_request_record_id":"recOther123456"},
    {"output_record_id":"recOutputTest123","extra":{"photo_workers":8}},
    {"output_record_id":"recOutputTest123","unexpected":"unbounded"},
])
def test_unscoped_or_unbounded_media_requests_fail_closed(client,payload):
    c,calls=client
    r=c.post("/stages/r3",json=payload,headers={"X-Pipeline-Secret":"test-secret"})
    assert r.status_code==503
    assert not calls


def test_exact_media_requests_require_all_scope(client,monkeypatch):
    c,calls=client
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET","recOutputTest123")
    r=c.post("/stages/r4",json={"output_record_id":"recOutputTest123"},
             headers={"X-Pipeline-Secret":"test-secret"})
    assert r.status_code==503 and not calls


def test_governor_circuit_defers_media_without_running_handler(client, monkeypatch):
    c,calls=client
    @contextmanager
    def denied(*_a,**_k):
        raise governor.AdmissionDeferred("db circuit")
        yield
    monkeypatch.setattr(governor,"resource_slot",denied)
    r=c.post("/stages/r5",json={"output_record_id":"recOutputTest123"},
             headers={"X-Pipeline-Secret":"test-secret"})
    assert r.status_code==503
    assert r.get_json()["error"]=="recovery_media_capacity_deferred"
    assert not calls


def test_manual_recovery_stages_never_reopen_publisher_side_routes(client):
    c,_=client
    assert c.post("/jobs/i1-durable", json={}).status_code==503
    assert c.post("/stages/smv1/drain", json={}).status_code==503
    assert c.post("/jobs/native-gallery/execute", json={}).status_code==503
    h=c.get("/health").get_json()
    assert h["recovery_read_only"] is True
    assert h["recovery_nonpublishing_media_stages"]==["r2","r3","r4","r5","smv1"]
