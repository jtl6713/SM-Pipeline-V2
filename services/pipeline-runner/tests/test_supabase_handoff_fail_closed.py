"""Supabase-only I3/I4 handoff must never acknowledge phantom Content Items."""
import pytest

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from i4 import processor as i4


def _client():
    return AirtableClient(settings={
        "airtable_pat": "test",
        "airtable_base_id": "appTest",
        "studio_write_source": "supabase",
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "test-key",
    })


def test_create_rejects_phantom_content_item(monkeypatch):
    # The old code generated a rec ID after the authoritative insert failed.
    # I4 then marked the Idea Promoted, hiding it with no Content Item.
    monkeypatch.setattr("supabase_pipeline.commit_minted_creates", lambda *a, **k: False)
    client = _client()
    with pytest.raises(RuntimeError, match="authoritative create did not commit"):
        client.create_records(CONTENT_ITEMS_TABLE, [{"Content_Title": "NYC handoff"}])


def test_update_does_not_acknowledge_failed_mirror(monkeypatch):
    client = _client()
    monkeypatch.setattr(client, "_mirror", lambda *a, **k: {"ok": True, "count": 0})
    with pytest.raises(RuntimeError, match="Supabase update failed"):
        client.update_record(CONTENT_ITEMS_TABLE, "rec1234567890ABCD", {"Content_Status": "Ready"})


def test_batch_update_does_not_acknowledge_failed_mirror(monkeypatch):
    client = _client()
    monkeypatch.setattr(client, "_mirror", lambda *a, **k: {"ok": True, "count": 0})
    with pytest.raises(RuntimeError, match="Supabase batch update failed"):
        client.update_records(PLATFORM_OUTPUTS_TABLE, [{
            "id": "rec1234567890ABCD", "fields": {"Output_Status": "Ready for Review"},
        }])


def test_i4_never_promotes_idea_after_failed_content_create(monkeypatch):
    updates = []

    class FailedCreateClient:
        def get_record(self, table, record_id):
            return {"id": record_id, "fields": {
                "Candidate_Status": "Approved",
                "Candidate_Title": "Grand Central Whispering Gallery",
            }}

        def create_records(self, *_args, **_kwargs):
            raise RuntimeError("Supabase authoritative create did not commit")

        def update_record(self, *_args, **_kwargs):
            updates.append((_args, _kwargs))

    monkeypatch.setattr(i4, "AirtableClient", FailedCreateClient)
    with pytest.raises(RuntimeError, match="authoritative create did not commit"):
        i4.process_request(record_id="rec1234567890ABCD")
    assert updates == [], "do not hide the Idea before durable Content Item creation"
