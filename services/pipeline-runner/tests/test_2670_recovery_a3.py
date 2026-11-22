"""Incident 2670: only one canonical image may classify during DB recovery."""
from contextlib import contextmanager
import pytest

import app as runner
from config import StageResult
from stages import a3 as a3_stage
import airtable.client as client_module


@pytest.fixture
def recovery_client(monkeypatch, tmp_path):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "test_governor.sqlite3"))
    monkeypatch.setenv("I1_DURABLE_ENABLED", "false")
    monkeypatch.setenv("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED", "false")
    monkeypatch.setenv("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED", "false")
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    class SupabaseOnlyClient:
        def get_record(self, table_id, record_id):
            assert record_id == "recBethesda111"
            return {"id": record_id, "fields": {
                "MIME_Type": "image/jpeg", "Media_Class": "Image",
                "Content_Profile": ["recNewYork111"],
                "Classification_Status": "Processing",
            }}
    monkeypatch.setattr(client_module, "AirtableClient", SupabaseOnlyClient)
    return runner.app.test_client()


def body(ids=None, **kwargs):
    return {"extra": {
        "record_ids": ids if ids is not None else ["recBethesda111"],
        "trigger_a4": False,
        "wait_for_next": False,
        "drain": False,
        "background": False,
        **kwargs,
    }}


def test_recovery_a3_forces_background_no_a4_and_keeps_other_routes_closed(recovery_client, monkeypatch):
    seen = []
    monkeypatch.setattr(runner, "get_handler", lambda name: (
        lambda request: (seen.append(request.extra) or StageResult(
            stage="a3", status="ok", message="queued", details={"background": True}
        ))))
    response = recovery_client.post("/stages/a3", json=body(),
        headers={"X-Pipeline-Secret": "test-secret"})
    assert response.status_code == 200
    assert response.json["stage"] == "a3"
    assert seen == [{
        "record_ids": ["recBethesda111"],
        "trigger_a4": False,
        "wait_for_next": False,
        "drain": False,
        "background": True,
        "max_records": 1,
    }]
    health = recovery_client.get("/health").json
    assert health["recovery_read_only"] is True
    assert health["recovery_image_classification_enabled"] is True
    for route in ("/stages/a4", "/stages/i1", "/jobs/studio-produce"):
        r = recovery_client.post(route, json=body(),
            headers={"X-Pipeline-Secret": "test-secret"})
        assert r.status_code == 503


def test_recovery_classify_rejects_unsafe_requests(recovery_client, monkeypatch):
    headers = {"X-Pipeline-Secret": "test-secret"}
    cases = [
        body(["recBethesda111","recOther222"]),
        body([], trigger_a4=False),
        body(trigger_a4=True),
        body(wait_for_next=True),
        body(drain=True),
        body(dry_run=True),
        body(record_ids=["recBethesda111"], production_request_record_id="recUnwanted"),
        {"extra":{"record_ids":["recBethesda111"]}},
        {"extra":{"record_ids":[{"id":"recBethesda111"}],"trigger_a4":False,"wait_for_next":False,"drain":False}},
    ]
    for payload in cases:
        r = recovery_client.post("/stages/a3", json=payload, headers=headers)
        assert r.status_code in (422, 503), payload
    assert recovery_client.post("/stages/a3", json=body()).status_code == 401


def test_recovery_classify_fails_closed_on_video_or_missing_profile(recovery_client, monkeypatch):
    headers = {"X-Pipeline-Secret": "test-secret"}
    class WrongMedia:
        def __init__(self, fields):
            self.fields = fields
        def get_record(self, *_):
            return {"id":"recBethesda111","fields":self.fields}
    for fields in (
        {"MIME_Type":"video/mp4","Media_Class":"Video","Content_Profile":["recNewYork111"]},
        {"MIME_Type":"image/jpeg","Media_Class":"Image","Content_Profile":[]},
        {"MIME_Type":"image/jpeg","Media_Class":"Image","Content_Profile":["recNewYork111"],"Do_Not_Use":True},
    ):
        monkeypatch.setattr(client_module,"AirtableClient",lambda:WrongMedia(fields))
        r=recovery_client.post("/stages/a3",json=body(),headers=headers)
        assert r.status_code in (409, 422), fields


def test_recovery_classify_requires_governor(recovery_client,monkeypatch):
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED","false")
    assert recovery_client.post("/stages/a3",json=body(),
        headers={"X-Pipeline-Secret":"test-secret"}).status_code == 503


def test_background_a3_holds_single_governor_lease_while_classifying(monkeypatch):
    seen=[]
    monkeypatch.setattr(a3_stage.workload_governor,"enabled",lambda:True)
    monkeypatch.setattr(a3_stage.workload_governor,"admission_paused",lambda:True)
    @contextmanager
    def lease(scope,**kwargs):
        assert scope == "library_image_classify"
        assert kwargs == {"limit":1,"allow_during_recovery":True}
        seen.append("acquired")
        try:
            yield
        finally:
            seen.append("released")
    monkeypatch.setattr(a3_stage.workload_governor,"resource_slot",lease)
    @contextmanager
    def image_scope(record_id):
        assert record_id == "recBethesda111"
        seen.append("scope-enter")
        try:
            yield
        finally:
            seen.append("scope-exit")
    monkeypatch.setattr(a3_stage.workload_governor,"a3_classification_scope",image_scope)
    monkeypatch.setattr(a3_stage,"process_request",lambda **k: (
        seen.append(("classified",k.get("record_ids"),k.get("trigger_a4")))
        or {"classified_count":1}))
    a3_stage._run_background({
        "record_ids":["recBethesda111"],
        "trigger_a4":False,"drain":False,"wait_for_next":False,"max_records":1,
    })
    assert seen == ["acquired","scope-enter",("classified",["recBethesda111"],False),"scope-exit","released"]
