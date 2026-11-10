"""Phase 5 remainder reads. Default stays Airtable. No live calls."""

import requests

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from tests.test_supabase_pipeline_writes import Response, _settings


def _client(**extra):
    return AirtableClient(settings=_settings(**extra))


def test_default_output_list_stays_on_airtable(monkeypatch):
    airtable = []

    def fake_get(url, *, headers, params, timeout):
        airtable.append(url)
        return Response({"records": [{"id": "recOutput1", "fields": {"Platform": "Instagram"}}]})

    def fake_request(*_args, **_kwargs):
        raise AssertionError("supabase read")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_write_source="supabase").list_records(PLATFORM_OUTPUTS_TABLE, max_records=5)
    assert rows[0]["id"] == "recOutput1"
    assert airtable


def test_output_flag_reads_supabase_and_keeps_the_airtable_id(monkeypatch):
    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable list")

    def fake_request(method, url, *, headers, json, timeout):
        assert method == "GET"
        assert "platform_outputs" in url
        assert "output_number" in url
        return Response([{
            "airtable_record_id": "recOutput9",
            "output_number": 9,
            "platform": "Instagram",
            "do_not_publish": False,
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(
        PLATFORM_OUTPUTS_TABLE, max_records=5,
    )
    assert rows == [{
        "id": "recOutput9",
        "fields": {"Output_ID": 9, "Platform": "Instagram", "Do_Not_Publish": False},
    }]


def test_formula_and_content_flag_stay_independent(monkeypatch):
    seen = {"airtable": 0, "supabase": 0}

    def fake_get(url, *, headers, params, timeout):
        seen["airtable"] += 1
        return Response({"records": [{"id": "recContent1", "fields": {"Content_Title": "Pier"}}]})

    def fake_request(method, url, *, headers, json, timeout):
        seen["supabase"] += 1
        return Response([])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    client = _client(
        studio_runner_output_read_source="supabase",
        studio_runner_content_read_source="airtable",
    )
    formula_rows = client.list_records(
        PLATFORM_OUTPUTS_TABLE, formula='{Platform}="Instagram"', max_records=2,
    )
    content_rows = client.list_records(CONTENT_ITEMS_TABLE, max_records=2)
    assert formula_rows[0]["id"] == "recContent1"
    assert content_rows[0]["id"] == "recContent1"
    assert seen["airtable"] == 2
    assert seen["supabase"] == 0


def test_supabase_read_failure_falls_back_to_airtable(monkeypatch):
    def fake_get(url, *, headers, params, timeout):
        return Response({"records": [{"id": "recOutput1", "fields": {"Platform": "TikTok"}}]})

    def fake_request(*_args, **_kwargs):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(PLATFORM_OUTPUTS_TABLE)
    assert rows[0]["fields"]["Platform"] == "TikTok"
