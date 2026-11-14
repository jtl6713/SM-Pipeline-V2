"""Regression: TikTok handoff claims must prevent duplicate Gmail side effects."""
from unittest.mock import Mock
from ttd import ttd3


def _output():
    return {"id": "recABCDEFGHIJKLMN", "fields": {
        "Platform": "TikTok",
        "TikTok_Draft_Publish_ID": "pub-123",
        "TikTok_Draft_Delivered_At": "2026-11-14T00:00:00Z",
        "TikTok_Draft_Status": "Delivered to Inbox",
        "Manual_Completion_Status": "Manual Required",
        "TikTok_Manual_Completion_URL": "https://example.org/complete",
    }}


def test_claim_replay_never_sends(monkeypatch):
    client = Mock()
    client._settings = {"supabase_url": "https://db.example", "supabase_service_role_key": "key"}
    client.get_record.return_value = _output()
    monkeypatch.setattr(ttd3, "AirtableClient", lambda: client)
    monkeypatch.setattr(ttd3, "ttd3_eligibility_reason", lambda output: None)
    monkeypatch.setattr(ttd3, "PipelineSettings", lambda client: Mock(get=lambda key: None))
    monkeypatch.setattr(ttd3, "_rest", lambda *args, **kwargs: False)
    sender = Mock()
    monkeypatch.setattr(ttd3, "GmailClient", lambda: sender)
    result = ttd3.process_request(output_record_id="recABCDEFGHIJKLMN")
    assert result["reason"] == "email_claim_already_exists"
    sender.send_text.assert_not_called()
    client.update_record.assert_not_called()


def test_claim_backend_failure_fails_closed(monkeypatch):
    client = Mock()
    client._settings = {"supabase_url": "https://db.example", "supabase_service_role_key": "key"}
    client.get_record.return_value = _output()
    monkeypatch.setattr(ttd3, "AirtableClient", lambda: client)
    monkeypatch.setattr(ttd3, "ttd3_eligibility_reason", lambda output: None)
    monkeypatch.setattr(ttd3, "PipelineSettings", lambda client: Mock(get=lambda key: None))
    def fail(*args, **kwargs):
        raise RuntimeError("database unavailable")
    monkeypatch.setattr(ttd3, "_rest", fail)
    sender = Mock()
    monkeypatch.setattr(ttd3, "GmailClient", lambda: sender)
    result = ttd3.process_request(output_record_id="recABCDEFGHIJKLMN")
    assert result["reason"] == "email_claim_failed"
    sender.send_text.assert_not_called()
