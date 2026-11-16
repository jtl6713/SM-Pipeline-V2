"""Regression: a repeated TikTok delivery must not rearm its handoff email."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "ttd"


def test_ttd2_does_not_clear_handoff_receipt():
    source = (ROOT / "ttd2.py").read_text()
    assert '"TikTok_Draft_Email_Sent_At": None' not in source
    assert '"Operational_Email_Sent_At": None' not in source
    assert '"Operational_Email_Key": ""' not in source


def test_ttd1_rearms_receipt_only_for_new_publish_id():
    source = (ROOT / "ttd1.py").read_text()
    assert '"TikTok_Draft_Publish_ID": publish_id' in source
    assert '"TikTok_Draft_Email_Sent_At": None' in source


import pytest
from ttd import ttd2
from ttd.eligibility import ttd4_form_eligibility_reason


@pytest.mark.parametrize("provider_status", ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"])
@pytest.mark.parametrize("existing_token", ["emailed-token", ""])
def test_repeated_poll_keeps_completion_link_valid(monkeypatch, provider_status, existing_token):
    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "TikTok_Draft_Publish_ID": "draft-123",
        "TikTok_Draft_Type": "Video",
        "TikTok_Manual_Completion_Token": existing_token,
        "TikTok_Draft_Email_Sent_At": "2026-11-15T12:00:00Z",
    }}
    class Client:
        _settings = {"pipeline_runner_shared_secret": "unit-test-secret"}
        def get_record(self, *args):
            return record
        def update_record(self, table, record_id, fields):
            record["fields"].update(fields)
    class Settings:
        def __init__(self, client):
            pass
        def get(self, key):
            return "https://example.com/hooks/ttd4" if key == "TTD4_WEBHOOK_URL" else None
    class TikTok:
        def __init__(self, **kwargs):
            pass
        def draft_status(self, publish_id):
            return 200, {}
    monkeypatch.setattr(ttd2, "AirtableClient", Client)
    monkeypatch.setattr(ttd2, "PipelineSettings", Settings)
    monkeypatch.setattr(ttd2, "TikTokDraftClient", TikTok)
    monkeypatch.setattr(ttd2, "ttd2_eligibility_reason", lambda *a, **k: None)
    monkeypatch.setattr(ttd2, "load_tiktok_settings", lambda *a, **k: {"url": "", "secret": ""})
    monkeypatch.setattr(ttd2, "draft_status_from", lambda body: provider_status)
    monkeypatch.setattr(ttd2, "public_post_ids_from", lambda body: [])
    ttd2.process_request(output_record_id=record["id"])
    token = record["fields"]["TikTok_Manual_Completion_Token"]
    url = record["fields"]["TikTok_Manual_Completion_URL"]
    assert token and (not existing_token or token == existing_token)
    ttd2.process_request(output_record_id=record["id"])
    assert record["fields"]["TikTok_Manual_Completion_URL"] == url
    assert ttd4_form_eligibility_reason(record, token=token) is None
    assert ttd4_form_eligibility_reason(record, token="wrong-token") == "token_mismatch"
    assert record["fields"]["TikTok_Draft_Email_Sent_At"] == "2026-11-15T12:00:00Z"


def test_completion_token_is_stable_across_concurrent_mints():
    from ttd.package import completion_token_material, hash_completion_token

    first = hash_completion_token(completion_token_material("recABCDEFGHIJKLMN", "draft-123"))
    second = hash_completion_token(completion_token_material("recABCDEFGHIJKLMN", "draft-123"))
    assert first == second
    assert first != hash_completion_token(
        completion_token_material("recABCDEFGHIJKLMN", "draft-OTHER")
    )


@pytest.mark.parametrize("provider_status", ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"])
def test_pre_email_polls_converge_on_stable_token(monkeypatch, provider_status):
    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "TikTok_Draft_Publish_ID": "draft-123",
        "TikTok_Draft_Type": "Video",
        "TikTok_Manual_Completion_Token": "",
        "TikTok_Draft_Email_Sent_At": "",
    }}

    class Client:
        _settings = {"pipeline_runner_shared_secret": "unit-test-secret"}
        def get_record(self, *args):
            return record

        def update_record(self, table, record_id, fields):
            record["fields"].update(fields)

    class Settings:
        def __init__(self, client):
            pass

        def get(self, key):
            return "https://example.com/hooks/ttd4" if key == "TTD4_WEBHOOK_URL" else None

    class TikTok:
        def __init__(self, **kwargs):
            pass

        def draft_status(self, publish_id):
            return 200, {}

    monkeypatch.setattr(ttd2, "AirtableClient", Client)
    monkeypatch.setattr(ttd2, "PipelineSettings", Settings)
    monkeypatch.setattr(ttd2, "TikTokDraftClient", TikTok)
    monkeypatch.setattr(ttd2, "ttd2_eligibility_reason", lambda *a, **k: None)
    monkeypatch.setattr(ttd2, "load_tiktok_settings", lambda *a, **k: {"url": "", "secret": ""})
    monkeypatch.setattr(ttd2, "draft_status_from", lambda body: provider_status)
    monkeypatch.setattr(ttd2, "public_post_ids_from", lambda body: [])
    ttd2.process_request(output_record_id=record["id"])
    token = record["fields"]["TikTok_Manual_Completion_Token"]
    url = record["fields"]["TikTok_Manual_Completion_URL"]
    from ttd.package import completion_token_material, hash_completion_token

    from ttd.package import stable_completion_token
    assert token == stable_completion_token(record["id"], "draft-123", secret="unit-test-secret")
    ttd2.process_request(output_record_id=record["id"])
    assert record["fields"]["TikTok_Manual_Completion_Token"] == token
    assert record["fields"]["TikTok_Manual_Completion_URL"] == url


def test_signed_completion_is_stable_across_concurrent_first_poll_snapshots():
    from ttd.package import stable_completion_token

    # Both workers start from a row without a completion token, before either
    # has committed. Their independently generated links must still match.
    secret = "unit-test-secret"
    a = stable_completion_token("recABCDEFGHIJKLMN", "publish-1", secret=secret)
    b = stable_completion_token("recABCDEFGHIJKLMN", "publish-1", secret=secret)
    assert a == b and len(a) == 64
    assert a != stable_completion_token("recABCDEFGHIJKLMN", "publish-2", secret=secret)
    assert a != stable_completion_token("recDIFFERENT12345", "publish-1", secret=secret)
    assert a != stable_completion_token("recABCDEFGHIJKLMN", "publish-1", secret="other-secret")
    with pytest.raises(ValueError):
        stable_completion_token("recABCDEFGHIJKLMN", "publish-1", secret="")


def test_form_accepts_signed_email_link_when_supabase_bag_was_overwritten():
    from ttd.package import stable_completion_token

    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "TikTok_Draft_Publish_ID": "publish-1",
        # Simulate a concurrent JSON bag writer reviving an older token.
        "TikTok_Manual_Completion_Token": "stale-token",
        "Manual_Completion_Status": "Required",
    }}
    signed = stable_completion_token(record["id"], "publish-1", secret="unit-test-secret")
    assert ttd4_form_eligibility_reason(record, token=signed, signing_secret="unit-test-secret") is None
    assert ttd4_form_eligibility_reason(record, token="stale-token", signing_secret="unit-test-secret") is None
    assert ttd4_form_eligibility_reason(record, token="", signing_secret="unit-test-secret") == "token_mismatch"
    assert ttd4_form_eligibility_reason(record, token=signed, signing_secret="wrong-secret") == "token_mismatch"
    record["fields"]["TikTok_Draft_Publish_ID"] = "publish-2"
    assert ttd4_form_eligibility_reason(record, token=signed, signing_secret="unit-test-secret") == "token_mismatch"


def test_empty_legacy_token_never_authorizes_form():
    record = {"id": "recABCDEFGHIJKLMN", "fields": {
        "TikTok_Draft_Publish_ID": "draft-123",
        "TikTok_Manual_Completion_Token": "",
        "Manual_Completion_Status": "Required",
    }}
    assert ttd4_form_eligibility_reason(record, token="", signing_secret="unit-test-secret") == "token_mismatch"
    assert ttd4_form_eligibility_reason(record, token="wrong-token", signing_secret="unit-test-secret") == "token_mismatch"
