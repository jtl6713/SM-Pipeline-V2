"""Incident #2670: canonical Supabase CAS prevents stale transfer claims."""
import pytest

from item4 import processor as item4
from studio_produce import workload_governor as gov
import supabase_pipeline


class FakeClient:
    _settings = {"supabase_url": "https://fake.invalid", "supabase_service_role_key": "test"}

    def __init__(self):
        self.unconditional_mutations = 0

    def update_record(self, *_args, **_kwargs):
        self.unconditional_mutations += 1
        raise AssertionError("CAS must never fall through to unconditional queue upsert")


def _enable(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "claims.sqlite3"))


def test_pending_to_processing_is_atomic_and_no_double_upsert(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    calls = []

    def rest(settings, path, method, body, *, prefer):
        calls.append((path, method, body, prefer))
        return [{"airtable_record_id": "recTransfer1"}]

    monkeypatch.setattr(supabase_pipeline, "_rest", rest)
    client = FakeClient()
    item4._claim_row(client, "recTransfer1", {"Transfer_Status": "Pending", "Attempt_Count": 2})
    assert client.unconditional_mutations == 0
    assert len(calls) == 1
    path, method, body, prefer = calls[0]
    assert "airtable_record_id=eq.recTransfer1&status=eq.Pending" in path
    assert method == "PATCH" and prefer == "return=representation"
    assert body["status"] == "Processing" and body["attempt_count"] == 3


def test_claim_with_existing_owner_returns_conflict_without_writes(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    monkeypatch.setattr(supabase_pipeline, "_rest", lambda *_args, **_kwargs: [])
    client = FakeClient()
    with pytest.raises(item4.TransferClaimConflict):
        item4._claim_row(client, "recTransfer2", {"Transfer_Status": "Pending"})
    assert client.unconditional_mutations == 0


def test_unverifiable_claim_fails_closed(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    monkeypatch.setattr(supabase_pipeline, "_rest", lambda *_args, **_kwargs: None)
    with pytest.raises(RuntimeError, match="could not be verified"):
        item4._claim_row(FakeClient(), "recTransfer2", {"Transfer_Status": "Pending"})


def test_drive_uploaded_resume_requires_exact_state(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    calls = []
    def rest(_settings, path, *_args, **_kwargs):
        calls.append(path)
        return [{"airtable_record_id": "recTransfer3"}]
    monkeypatch.setattr(supabase_pipeline, "_rest", rest)
    item4._claim_row(FakeClient(), "recTransfer3", {"Transfer_Status": "Drive Uploaded"})
    assert "status=eq.Drive Uploaded" in calls[0]


def test_raced_queue_row_does_not_invoke_media_processing(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    client = FakeClient()
    client.get_record = lambda *_: {"id": "recTransfer4", "fields": {"Transfer_Status": "Pending"}}
    def raced(*_args):
        raise item4.TransferClaimConflict("already claimed")
    monkeypatch.setattr(item4, "_process_queue_row_unlocked", raced)
    outcome = item4.process_queue_row(client, {"id": "recTransfer4"})
    assert outcome == {
        "processed": False, "reason": "claimed_elsewhere", "queue_record_id": "recTransfer4",
    }


def test_governed_stale_reclaim_waits_beyond_lease_age(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    import time
    class QueueClient:
        def list_records(self, *_args, **_kwargs):
            return [{"id": "recStaleProcessing", "fields": {
                "Transfer_Status": "Processing", "Asset_Kind": "Platform Variant",
                "Attempt_Count": 1,
            }}]
        def update_record(self, *_args, **_kwargs):
            raise AssertionError("do not reclaim a possibly live crop after 90s")

    monkeypatch.setattr(item4, "_row_stamp_ms", lambda _row: int((time.time() - 15 * 60) * 1000))
    monkeypatch.setattr(gov, "resource_active", lambda *_: False)
    assert item4.requeue_stale_processing(QueueClient()) == 0


def test_deferred_media_slot_is_not_recorded_as_failed_transfer(monkeypatch, tmp_path):
    _enable(monkeypatch, tmp_path)
    class QueueClient:
        def update_record(self, *_args, **_kwargs):
            raise AssertionError("no failure state on governor admission deferral")

    monkeypatch.setattr(item4, "AirtableClient", QueueClient)
    monkeypatch.setattr(item4, "requeue_stale_processing", lambda *_args, **_kwargs: 0)
    monkeypatch.setattr(item4, "select_next_row", lambda *_args, **_kwargs: {
        "id": "recWaiting", "fields": {"Transfer_Status": "Pending"},
    })
    monkeypatch.setattr(item4, "process_queue_row", lambda *_args: (
        (_ for _ in ()).throw(gov.AdmissionDeferred("test capacity"))
    ))
    assert item4.process_one() == {"processed": False, "reason": "governor_admission_deferred"}
