"""I1 corrective generation: no Airtable or AI network calls."""
from i1 import processor


class CandidateClient:
    def __init__(self):
        self.creates = []
    def get_record(self, table, record_id):
        return {"id": record_id, "fields": {"Daily_Idea_Limit": 5}}
    def create_records(self, table, rows, **kwargs):
        self.creates.append((table, rows, kwargs))
        return [{"id": "rec" + "C" * 14}]


def test_duplicate_title_regenerates_once_before_any_write(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year",
                        lambda client, title: title == "Chicago River Walk")
    prompts = []
    def generated(prompt):
        prompts.append(prompt)
        if len(prompts) == 1:
            return {"parsed": {"ideas": [{"candidate_title": "Chicago River Walk"}]}}
        return {"parsed": {"ideas": [{"candidate_title": "Unexpected Bronzeville Courtyard"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generated)
    result = processor.process_request(
        profile_record_id="rec" + "P" * 14,
        batch_record_id="rec" + "B" * 14, requested_count=1)
    assert result["processed"] is True
    assert result["created_count"] == 1
    assert result["generation_attempts"] == 2
    assert len(prompts) == 2
    assert "Chicago River Walk" in prompts[1]
    assert len(client.creates) == 1
    saved = client.creates[0][1][0]
    assert saved["Candidate_Title"] == "Unexpected Bronzeville Courtyard"
    assert saved["Idea_Batch"] == ["rec" + "B" * 14]


def test_repeated_duplicates_return_specific_failure_without_any_write(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *a: True)
    calls = []
    def generated(prompt):
        calls.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": "Already Used Title"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generated)
    result = processor.process_request(profile_record_id="rec" + "P"*14, requested_count=1)
    assert result["processed"] is False
    assert result["reason"] == "no_unique_candidates_after_regeneration"
    assert result["generation_attempts"] == 2
    assert len(calls) == 2
    assert client.creates == []


def test_unexpected_ai_shape_is_not_silently_accepted(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "generate_ideas", lambda _: {"parsed": {"candidates": []}})
    result = processor.process_request(profile_record_id="rec" + "P"*14, requested_count=1)
    assert result["processed"] is False
    assert result["reason"] == "empty_or_invalid_ai_ideas_after_regeneration"
    assert result["invalid_ai_responses"] == 2
    assert result["generation_attempts"] == 2
    assert client.creates == []


def test_uncertain_first_write_is_never_retried(monkeypatch):
    client = CandidateClient()
    def uncertain(*args, **kwargs):
        raise TimeoutError("Airtable POST outcome unknown")
    client.create_records = uncertain
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *args: False)
    prompts = []
    def generated(prompt):
        prompts.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": "Fresh Bronzeville Courtyard"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generated)
    result = processor.process_request(profile_record_id="rec" + "P"*14, requested_count=1)
    assert result["processed"] is False
    assert result["partial_failure"] is True
    assert result["retry_requires_reconciliation"] is True
    assert len(prompts) == 1


def test_no_extra_model_calls_after_one_candidate_saved(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *args: False)
    calls = []
    def generated(prompt):
        calls.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": "First Unique Concept"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generated)
    result = processor.process_request(profile_record_id="rec" + "P"*14, requested_count=2)
    assert result["processed"] is True
    assert result["created_count"] == 1
    assert result["generation_attempts"] == 1
    assert len(calls) == 1
    assert len(client.creates) == 1


def test_empty_create_acknowledgement_requires_reconciliation_not_regeneration(monkeypatch):
    client = CandidateClient()
    client.create_records = lambda *args, **kwargs: []
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *args: False)
    calls = []
    def generated(prompt):
        calls.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": "New Chicago Window Detail"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generated)
    result = processor.process_request(profile_record_id="rec" + "P"*14, requested_count=1)
    assert result["processed"] is False
    assert result["reason"] == "candidate_create_unconfirmed"
    assert result["partial_failure"] is True
    assert result["retry_requires_reconciliation"] is True
    assert len(calls) == 1

def test_excluded_failed_pass_title_cannot_be_recreated_even_when_history_empty(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *args: False)
    prompts = []

    def generate(prompt):
        prompts.append(prompt)
        if len(prompts) == 1:
            return {"parsed": {"ideas": [{"candidate_title": "Hidden Subway Entrance (2)"}]}}
        return {"parsed": {"ideas": [{"candidate_title": "NYC Ferry Fare Tips"}]}}

    monkeypatch.setattr(processor, "generate_ideas", generate)
    result = processor.process_request(
        profile_record_id="rec" + "P"*14,
        requested_count=1,
        excluded_titles=("Hidden Subway Entrance",),
    )
    assert result["processed"] is True
    assert result["created_count"] == 1
    assert result["generation_attempts"] == 2
    assert "Hidden Subway Entrance" in prompts[0]
    assert len(client.creates) == 1
    assert client.creates[0][1][0]["Candidate_Title"] == "NYC Ferry Fare Tips"


def test_failed_refill_exclusions_only_guide_without_writing_duplicates(monkeypatch):
    client = CandidateClient()
    monkeypatch.setattr(processor, "AirtableClient", lambda: client)
    monkeypatch.setattr(processor, "_title_used_in_last_year", lambda *args: False)
    prompts = []
    def generate(prompt):
        prompts.append(prompt)
        return {"parsed": {"ideas": [{"candidate_title": "NYC Waterfront Walk (3)"}]}}
    monkeypatch.setattr(processor, "generate_ideas", generate)
    result = processor.process_request(
        profile_record_id="rec" + "P"*14,
        requested_count=1,
        excluded_titles=("NYC Waterfront Walk",),
    )
    assert result["processed"] is False
    assert result["created_record_ids"] == []
    assert result["reason"] == "no_unique_candidates_after_regeneration"
    assert len(prompts) == 2
    assert len(client.creates) == 0
