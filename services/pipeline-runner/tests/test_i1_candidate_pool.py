"""I1 candidate pool: persist only the operator-requested unique count."""
from i1 import processor


def test_nine_of_ten_uses_alternates_but_creates_exactly_one(monkeypatch):
    class Client:
        def __init__(self):
            self.saved = []
        def get_record(self, table, record):
            return {"id": record, "fields": {"Daily_Idea_Limit": 10}}
        def create_records(self, table, records, **kwargs):
            self.saved.extend(records)
            return [{"id": "rec" + "N" * 14}]
    client = Client()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    names = ["Old Duplicate 1", "Old Duplicate 2", "A Fresh Topic",
             "Another Fresh Topic", "Extra Topic"]
    seen_prompts = []
    def response(prompt):
        seen_prompts.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": n} for n in names]}}
    monkeypatch.setattr(processor, "generate_ideas", response)
    monkeypatch.setattr(processor, "_title_used_in_last_year",
                        lambda client, title: title.startswith("Old"))
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14,
        batch_record_id="rec" + "B" * 14,
        requested_count=1, quality="Highest Quality",
        exclude_titles=["Nine confirmed ideas from batch"],
        trigger_i2=False)
    assert result["processed"] is True
    assert result["created_count"] == 1
    assert result["missing_count"] == 0
    assert len(client.saved) == 1
    assert client.saved[0]["Candidate_Title"] == "A Fresh Topic"
    assert result["candidate_pool_count"] == 5
    assert "Return 5 distinct candidates" in seen_prompts[0]
    assert "Nine confirmed ideas from batch" in seen_prompts[0]


def test_pool_does_not_use_same_batch_title_even_without_year_lookup(monkeypatch):
    class Client:
        def __init__(self):
            self.created = []
        def get_record(self, table, record):
            return {"id": record, "fields": {"Daily_Idea_Limit": 10}}
        def create_records(self, table, rows, **kwargs):
            self.created.extend(rows)
            return [{"id": "rec" + "X" * 14}]
    client = Client()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *a: False)
    monkeypatch.setattr(processor, "generate_ideas", lambda prompt: {
        "parsed": {"ideas": [
            {"candidate_title": "Grand Central Ceiling Details"},
            {"candidate_title": "Grand Central Ceiling Details 2"},
            {"candidate_title": "No-Cost Brooklyn Museum Weekday"},
        ]}})
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14, requested_count=1,
        exclude_titles=["Grand Central Ceiling Details"], trigger_i2=False)
    assert result["created_count"] == 1
    assert len(client.created) == 1
    assert client.created[0]["Candidate_Title"] == "No-Cost Brooklyn Museum Weekday"


def test_ambiguous_airtable_write_never_tries_next_alternative(monkeypatch):
    class Client:
        def get_record(self, table, record):
            return {"id": record, "fields": {"Daily_Idea_Limit": 10}}
        def create_records(self, *args, **kwargs):
            raise TimeoutError("write result unknown")
    monkeypatch.setattr(processor, "AirtableClient", Client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *a: False)
    calls = []
    def response(prompt):
        calls.append(1)
        return {"parsed": {"ideas": [
            {"candidate_title": "Fresh NYC Topic One"},
            {"candidate_title": "Fresh NYC Topic Two"},
        ]}}
    monkeypatch.setattr(processor, "generate_ideas", response)
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14,
        requested_count=1, trigger_i2=False)
    assert result["partial_failure"] is True
    assert result["retry_requires_reconciliation"] is True
    assert result["created_count"] == 0
    assert len(calls) == 1
