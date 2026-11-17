"""Quality Coach regression tests for TikTok notification metadata."""
from unittest.mock import Mock
from ttd import ttd3
from ttd.handoff_quality import validate_handoff_metadata


def _photo(**overrides):
    fields = {
        "Platform": "TikTok", "Output_ID": 4812,
        "Output_Title": "Lakefront Trail Explained",
        "TikTok_Draft_Type": "Photo Carousel",
        "Thumbnail_URL": "https://media.chicagoshining.com/cover/lakefront.jpg",
        "TikTok_Draft_Assets_JSON": '["https://media.chicagoshining.com/a.jpg","https://media.chicagoshining.com/b.jpg"]',
    }
    fields.update(overrides)
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_good_photo_metadata():
    assert validate_handoff_metadata(_photo()) == []


def test_missing_title_and_number():
    errors = validate_handoff_metadata(_photo(Output_ID=None, Output_Title=None))
    assert "missing_numeric_output_id" in errors
    assert "missing_output_title" in errors


def test_shared_unknown_cover_rejected():
    errors = validate_handoff_metadata(_photo(
        Thumbnail_URL="https://media.chicagoshining.com/publish/platform-output-unknown/cover.jpg"))
    assert "missing_output_specific_cover" in errors


def test_duplicate_and_missing_photo_assets_rejected():
    assert "missing_photo_manifest" in validate_handoff_metadata(
        _photo(TikTok_Draft_Assets_JSON="[]"))
    assert "duplicate_photo_urls" in validate_handoff_metadata(
        _photo(TikTok_Draft_Assets_JSON='["https://example.com/a.jpg","https://example.com/a.jpg"]'))


def test_incomplete_handoff_never_claims_or_sends(monkeypatch):
    client = Mock()
    client._settings = {"pipeline_runner_shared_secret": "test-secret"}
    client.get_record.return_value = _photo(Output_ID=None, Output_Title=None)
    monkeypatch.setattr(ttd3, "AirtableClient", lambda: client)
    monkeypatch.setattr(ttd3, "ttd3_eligibility_reason", lambda output: None)
    monkeypatch.setattr(ttd3, "PipelineSettings", lambda client: Mock(get=lambda key: None))
    claim = Mock()
    sender = Mock()
    monkeypatch.setattr(ttd3, "_rest", claim)
    monkeypatch.setattr(ttd3, "GmailClient", lambda: sender)
    result = ttd3.process_request(output_record_id="recABCDEFGHIJKLMN")
    assert result["reason"] == "handoff_metadata_incomplete"
    assert "missing_numeric_output_id" in result["quality_errors"]
    claim.assert_not_called()
    sender.send_text.assert_not_called()
    client.update_record.assert_not_called()
