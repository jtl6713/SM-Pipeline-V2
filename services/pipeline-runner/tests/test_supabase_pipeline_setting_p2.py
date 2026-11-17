"""P2 must find the active voiceover-normalizer setting from Supabase, not Airtable."""

from urllib.parse import unquote

import requests

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from item4.settings import PipelineSettings
from tests.test_supabase_pipeline_writes import Response, _settings


NORMALIZER_SETTING = "Voiceover_Normalization_Service_URL"
NORMALIZER_URL = "https://voiceover.chicagoshining.com"


def test_active_normalizer_setting_available_on_supabase_only(monkeypatch):
    seen = []

    def fake_request(method, url, *, headers, json=None, timeout=None):
        seen.append((method, unquote(url)))
        assert method == "GET"
        assert "/rest/v1/engagement_settings?" in url
        # Server-side active filter must precede the limit. Both active and
        # historical inactive settings exist in the real Supabase table.
        assert "payload->>Active=eq.true" in unquote(url)
        assert "limit=1" in url
        return Response([{
            "airtable_record_id": "recPVVSpMh6F0fxuc",
            "payload": {
                "source": "pipeline",
                "Setting_Name": NORMALIZER_SETTING,
                "Setting_Value": NORMALIZER_URL,
                "Active": True,
            },
        }])

    monkeypatch.setattr(requests, "request", fake_request)
    def no_airtable(*args, **kwargs):
        raise AssertionError("Airtable archive must not be queried")
    monkeypatch.setattr(requests, "get", no_airtable)
    client = AirtableClient(settings=_settings(studio_write_source="supabase"))
    assert PipelineSettings(client).get(NORMALIZER_SETTING) == NORMALIZER_URL
    assert len(seen) == 1


def test_no_active_setting_returns_empty_without_archive_fallback(monkeypatch):
    seen = []

    def fake_request(method, url, *, headers, json=None, timeout=None):
        seen.append(url)
        return Response([])

    monkeypatch.setattr(requests, "request", fake_request)
    monkeypatch.setattr(requests, "get", lambda *a, **kw: (_ for _ in ()).throw(AssertionError("Airtable GET")))
    client = AirtableClient(settings=_settings(studio_write_source="supabase"))
    assert client.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula='AND({Active}=1,{Setting_Name}="Voiceover_Normalization_Service_URL")',
        max_records=1,
    ) == []
    assert len(seen) == 1
