from __future__ import annotations

import ai_api_preference
from airtable.constants import PIPELINE_SETTINGS_TABLE


def test_runtime_preference_reads_azure_from_pipeline_settings(monkeypatch):
    seen = {}

    class FakeClient:
        def __init__(self, settings):
            seen["settings"] = settings

        def list_records(self, table_id, **kwargs):
            seen["table_id"] = table_id
            seen["formula"] = kwargs.get("formula")
            return [{
                "id": "recPreference",
                "fields": {
                    "Setting_Name": "AI_API_PREFERRED_PROVIDER",
                    "Setting_Value": "Azure",
                    "Active": True,
                },
            }]

    monkeypatch.setattr(ai_api_preference, "AirtableClient", FakeClient)

    account = ai_api_preference.get_preferred_account({"openai_account": "PRIMARY", "airtable_pat": "test"})

    assert account == "SECONDARY"
    assert seen["table_id"] == PIPELINE_SETTINGS_TABLE
    assert seen["formula"] == 'AND({Active}=1,{Setting_Name}="AI_API_PREFERRED_PROVIDER")'


def test_runtime_preference_reads_openai_from_pipeline_settings(monkeypatch):
    class FakeClient:
        def __init__(self, settings):
            pass

        def list_records(self, table_id, **kwargs):
            return [{"fields": {"Setting_Value": "OpenAI"}}]

    monkeypatch.setattr(ai_api_preference, "AirtableClient", FakeClient)

    assert ai_api_preference.get_preferred_account({"openai_account": "SECONDARY"}) == "PRIMARY"


def test_runtime_preference_falls_back_to_startup_default_on_airtable_error(monkeypatch):
    class FakeClient:
        def __init__(self, settings):
            pass

        def list_records(self, table_id, **kwargs):
            raise RuntimeError("simulated")

    monkeypatch.setattr(ai_api_preference, "AirtableClient", FakeClient)

    assert ai_api_preference.get_preferred_account({"openai_account": "SECONDARY"}) == "SECONDARY"


def test_missing_startup_account_defaults_to_azure_not_primary(monkeypatch):
    class FakeClient:
        def __init__(self, settings):
            pass

        def list_records(self, table_id, **kwargs):
            raise RuntimeError("simulated")

    monkeypatch.setattr(ai_api_preference, "AirtableClient", FakeClient)

    assert ai_api_preference.get_preferred_account({}) == "SECONDARY"
    assert ai_api_preference.get_preferred_account({"openai_account": "bogus"}) == "SECONDARY"
