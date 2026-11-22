"""Incident 2670: A3 may save metadata for ONE verified photo during recovery.

These are hermetic SQLite and HTTP-stub checks. No external publishing or
Supabase network traffic, and no global unpause.
"""
import threading

import pytest
import requests

from studio_produce import workload_governor as gov
from supabase_pipeline import _rest


@pytest.fixture
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "governor.sqlite3"))
    monkeypatch.setenv("STUDIO_MAX_DB_WRITES", "1")
    monkeypatch.setenv("STUDIO_SIDE_EFFECT_OUTBOX_ENABLED", "false")
    return gov


def test_a3_exact_media_patch_allowed_once_and_no_other_recovery_mutations(isolated, monkeypatch):
    called = []
    class Response:
        ok = True
        status_code = 204
        text = ""
    def fake_request(method, url, **kwargs):
        called.append((method, url, kwargs["json"]))
        return Response()
    monkeypatch.setattr(requests, "request", fake_request)
    cfg = {"supabase_url": "https://example.invalid", "supabase_service_role_key": "test-only"}
    row = "recBethesda111"
    with pytest.raises(gov.AdmissionDeferred):
        _rest(cfg, f"media_assets?airtable_record_id=eq.{row}",
              "PATCH", {"metadata": {"classification_status": "Classified"}})
    with isolated.resource_slot("library_image_classify", limit=1, allow_during_recovery=True):
        with isolated.a3_classification_scope(row):
            assert isolated.a3_scoped_record_id() == row
            assert _rest(cfg, f"media_assets?airtable_record_id=eq.{row}",
                 "PATCH", {"metadata":{"classification_status":"Processing"}}) is None
            assert _rest(cfg, f"media_assets?airtable_record_id=eq.{row}",
                 "PATCH", {"metadata":{"classification_status":"Classified","ai_tags":"Bethesda"}}) is None
            for path, method, body in (
                (f"media_assets?airtable_record_id=eq.recOther222", "PATCH",
                    {"metadata":{"classification_status":"Classified"}}),
                ("platform_outputs?airtable_record_id=eq.recOther222", "PATCH",
                    {"metadata":{"classification_status":"Classified"}}),
                (f"media_assets?airtable_record_id=eq.{row}", "POST",
                    {"metadata":{"classification_status":"Classified"}}),
                (f"media_assets?airtable_record_id=eq.{row}", "PATCH",
                    {"do_not_use":False,"metadata":{"classification_status":"Classified"}}),
                (f"media_assets?airtable_record_id=eq.{row}", "PATCH",
                    {"metadata":{"classification_status":"Published"}}),
                (f"media_assets?airtable_record_id=eq.{row}", "PATCH",
                    {"media_class":"Image"}),
            ):
                with pytest.raises(gov.AdmissionDeferred):
                    _rest(cfg,path,method,body)
            with pytest.raises(gov.AdmissionDeferred):
                with isolated.resource_slot("supabase_write", limit=1):
                    pass
            with pytest.raises(gov.AdmissionDeferred):
                with isolated.resource_slot("photo_group", limit=1):
                    pass
    assert isolated.a3_scoped_record_id() == ""
    assert len(called) == 2
    assert all("media_assets" in item[1] for item in called)


def test_a3_scope_is_thread_local_and_raises_for_nested_or_nonrecovery(isolated, monkeypatch):
    with isolated.a3_classification_scope("recBethesda111"):
        with pytest.raises(gov.AdmissionDeferred):
            with isolated.a3_classification_scope("recOther222"):
                pass
        output = []
        def background():
            output.append(isolated.a3_scoped_record_id())
            try:
                with isolated.resource_slot("supabase_write", limit=1, allow_during_recovery=True):
                    output.append("unexpected")
            except gov.AdmissionDeferred:
                output.append("blocked")
        t = threading.Thread(target=background)
        t.start()
        t.join(timeout=4)
        assert output == ["", "blocked"]
    assert isolated.a3_scoped_record_id() == ""
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY","false")
    with pytest.raises(gov.AdmissionDeferred):
        with isolated.a3_classification_scope("recBethesda111"):
            pass
