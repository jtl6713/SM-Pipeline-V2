"""I1 partial-write recovery must not erase acknowledged Airtable creations."""
from i1 import processor


def test_partial_create_error_preserves_success_and_requires_reconciliation(monkeypatch):
    class Client:
        def __init__(self):
            self.calls = 0

        def get_record(self, table, record_id):
            return {"id": record_id, "fields": {"Daily_Idea_Limit": 3}}

        def create_records(self, *args, **kwargs):
            self.calls += 1
            if self.calls == 2:
                raise TimeoutError("write outcome unknown")
            return [{"id": "rec-first"}]

    client = Client()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda client, title: False)
    monkeypatch.setattr(processor, "generate_ideas", lambda prompt: {"parsed": {"ideas": [
        {"candidate_title": "First photo story"},
        {"candidate_title": "Second photo story"},
        {"candidate_title": "Third photo story"},
    ]}})
    result = processor.process_request(profile_record_id="rec-profile", requested_count=3)
    assert result["processed"] is True
    assert result["partial_failure"] is True
    assert result["created_count"] == 1
    assert result["created_record_ids"] == ["rec-first"]
    assert result["missing_count"] == 2
    assert result["retry_requires_reconciliation"] is True
    assert client.calls == 2


def test_first_create_error_does_not_claim_success(monkeypatch):
    class Client:
        def get_record(self, table, record_id):
            return {"id": record_id, "fields": {"Daily_Idea_Limit": 2}}

        def create_records(self, *args, **kwargs):
            raise TimeoutError("ambiguous write")

    monkeypatch.setattr(processor, "AirtableClient", Client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda client, title: False)
    monkeypatch.setattr(processor, "generate_ideas", lambda prompt: {"parsed": {"ideas": [
        {"candidate_title": "First photo story"},
    ]}})
    result = processor.process_request(profile_record_id="rec-profile", requested_count=2)
    assert result["processed"] is False
    assert result["partial_failure"] is True
    assert result["created_count"] == 0
    assert result["retry_requires_reconciliation"] is True
