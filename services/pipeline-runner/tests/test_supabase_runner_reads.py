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
            "error_messages": {"_runner_record_projection": "v1"},
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


def test_unmarked_or_empty_list_stays_on_airtable(monkeypatch):
    def fake_get(url, *, headers, params, timeout):
        return Response({"records": [{"id": "recOutput1", "fields": {"Platform": "TikTok"}}]})

    def fake_request(method, url, *, headers, json, timeout):
        if "order=output_number" in url:
            return Response([])
        return Response([{
            "airtable_record_id": "recOutput1",
            "platform": "Instagram",
            "error_messages": {"Output_Notes": "lean"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    client = _client(studio_runner_output_read_source="supabase")
    unmarked = client.list_records(PLATFORM_OUTPUTS_TABLE, max_records=5)
    empty = client.list_records(PLATFORM_OUTPUTS_TABLE, max_records=5, sort_field="Output_ID")
    assert unmarked[0]["fields"]["Platform"] == "TikTok"
    assert empty[0]["id"] == "recOutput1"


def test_formula_and_content_flag_stay_independent(monkeypatch):
    seen = {"airtable": 0, "supabase": []}

    def fake_get(url, *, headers, params, timeout):
        seen["airtable"] += 1
        return Response({"records": [{"id": "recContent1", "fields": {"Content_Title": "Pier"}}]})

    def fake_request(method, url, *, headers, json, timeout):
        seen["supabase"].append(url)
        return Response([{
            "airtable_record_id": "recOutputIg",
            "platform": "Instagram",
            "error_messages": {"_runner_record_projection": "v1"},
        }])

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
    assert formula_rows[0]["id"] == "recOutputIg"
    assert content_rows[0]["id"] == "recContent1"
    assert seen["airtable"] == 1
    assert len(seen["supabase"]) == 1
    assert "platform.eq.Instagram" in seen["supabase"][0]


def test_unsupported_formula_and_views_stay_on_airtable(monkeypatch):
    airtable = []

    def fake_get(url, *, headers, params, timeout):
        airtable.append(params.get("filterByFormula") or params.get("view"))
        return Response({"records": [{"id": "recOutput1", "fields": {"Platform": "TikTok"}}]})

    def fake_request(*_args, **_kwargs):
        raise AssertionError("supabase read")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    client = _client(studio_runner_output_read_source="supabase")
    find_rows = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula='IS_BEFORE({Publish_Next_Retry_At},NOW())',
        max_records=2,
    )
    view_rows = client.list_records(PLATFORM_OUTPUTS_TABLE, view="Ready Queue", max_records=2)
    assert find_rows[0]["fields"]["Platform"] == "TikTok"
    assert view_rows[0]["fields"]["Platform"] == "TikTok"
    assert len(airtable) == 2


def test_snapshotted_view_reads_supabase(monkeypatch):
    seen = []

    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable list")

    def fake_request(method, url, *, headers, json, timeout):
        seen.append(url)
        return Response([{
            "airtable_record_id": "recRender1",
            "render_status": "Rendering",
            "error_messages": {"_runner_record_projection": "v1", "Remotion_Status_URL": "https://render.example/job"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(
        PLATFORM_OUTPUTS_TABLE,
        view="R5 - Rendering Jobs to Poll",
        formula="{Test_Run_ID}=BLANK()",
        max_records=5,
    )
    assert rows[0]["id"] == "recRender1"
    assert "render_status.eq.Rendering" in seen[0]
    assert "test_run_id" in seen[0]


def test_produce_content_number_find_reads_supabase(monkeypatch):
    seen = []

    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable list")

    def fake_request(method, url, *, headers, json, timeout):
        seen.append(url)
        return Response([{
            "airtable_record_id": "recOutput102",
            "output_number": 12,
            "error_messages": {"_runner_record_projection": "v1"},
            "content_items": {"airtable_record_id": "recContent1023456"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula='FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0',
        max_records=50,
        sort_field="Output_ID",
        sort_direction="desc",
    )
    assert rows[0]["id"] == "recOutput102"
    assert "content_items.content_number=eq.102" in seen[0]
    assert "and=" not in seen[0]


def test_or_formula_reads_supabase(monkeypatch):
    seen = []

    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable list")

    def fake_request(method, url, *, headers, json, timeout):
        seen.append(url)
        return Response([{
            "airtable_record_id": "recOutputOr",
            "platform": "TikTok",
            "error_messages": {"_runner_record_projection": "v1"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula='OR({Platform}="TikTok",{Platform}="Instagram")',
        max_records=5,
    )
    assert rows[0]["id"] == "recOutputOr"
    assert "or(platform.eq.TikTok,platform.eq.Instagram)" in seen[0]


def test_r4_style_formula_reads_supabase(monkeypatch):
    seen = []

    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable list")

    def fake_request(method, url, *, headers, json, timeout):
        seen.append(url)
        return Response([{
            "airtable_record_id": "recReady1",
            "render_status": "Ready for Render",
            "final_file_url": None,
            "remotion_job_id": None,
            "test_run_id": None,
            "error_messages": {
                "_runner_record_projection": "v1",
                "Composition_ID": "Main",
                "Output_Filename": "out.mp4",
                "Render_Clip_List_JSON": "[]",
                "Render_Total_Frames": 120,
            },
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    formula = (
        'AND({Test_Run_ID}=BLANK(),AND({Render_Status}="Ready for Render",'
        '{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",'
        '{Render_Total_Frames}>0,{Final_File_URL}="",{Remotion_Job_ID}=""))'
    )
    rows = _client(studio_runner_output_read_source="supabase").list_records(
        PLATFORM_OUTPUTS_TABLE, formula=formula, max_records=5,
    )
    assert rows[0]["id"] == "recReady1"
    assert "render_status.eq.Ready" in seen[0]
    assert "error_messages->>Composition_ID" in seen[0]
    assert "Render_Total_Frames.gt.0" in seen[0]


def test_get_record_uses_a_marked_projection_and_keeps_links(monkeypatch):
    def fake_get(*_args, **_kwargs):
        raise AssertionError("airtable get")

    def fake_request(method, url, *, headers, json, timeout):
        assert method == "GET"
        assert "airtable_record_id=eq.recOutput9" in url
        assert "content_items" in url
        return Response([{
            "airtable_record_id": "recOutput9",
            "platform": "Instagram",
            "output_number": 9,
            "selected_assets": {"clips": [1]},
            "error_messages": {
                "_runner_record_projection": "v1",
                "_airtable_links": {"Content_Item": "recContent9"},
                "Output_Notes": "keep",
            },
            "content_items": {"airtable_record_id": "recContent9"},
            "content_profiles": {"airtable_record_id": "recProfile9"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    row = _client(studio_runner_output_read_source="supabase").get_record(
        PLATFORM_OUTPUTS_TABLE, "recOutput9",
    )
    assert row["id"] == "recOutput9"
    assert row["fields"]["Platform"] == "Instagram"
    assert row["fields"]["Output_Notes"] == "keep"
    assert row["fields"]["Selected_Assets_JSON"] == {"clips": [1]}
    assert row["fields"]["Content_Item"] == ["recContent9"]
    assert row["fields"]["Content_Profile"] == ["recProfile9"]
    assert "_runner_record_projection" not in row["fields"]


def test_unmarked_get_and_write_source_stay_on_airtable(monkeypatch):
    airtable = []

    def fake_get(url, *, headers, timeout):
        airtable.append(url)
        return Response({"id": "recOutput1", "fields": {"Platform": "TikTok"}})

    def fake_request(*_args, **_kwargs):
        return Response([{
            "airtable_record_id": "recOutput1",
            "platform": "Instagram",
            "error_messages": {"Output_Notes": "old"},
        }])

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    unmarked = _client(studio_runner_output_read_source="supabase").get_record(
        PLATFORM_OUTPUTS_TABLE, "recOutput1",
    )
    write_source = _client(studio_write_source="supabase").get_record(
        PLATFORM_OUTPUTS_TABLE, "recOutput1",
    )
    assert unmarked["fields"]["Platform"] == "TikTok"
    assert write_source["fields"]["Platform"] == "TikTok"
    assert len(airtable) == 2


def test_full_mirror_marks_a_resolved_output(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({
            "id": "recOutput1",
            "fields": {
                "Output_ID": 4,
                "Platform": "Instagram",
                "Content_Profile": ["recProfile1"],
                "Content_Item": ["recContent1"],
                "Selected_Assets_JSON": {"clips": [2]},
                "Output_Notes": "ready",
            },
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "content_profiles" in url:
            return Response([{"id": "prof-uuid"}])
        if "content_items" in url and method == "GET" and "select=id" in url:
            return Response([{"id": "content-uuid"}])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    _client().update_record(PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Scheduled"})
    posts = [row for row in seen if row[0] == "POST" and "platform_outputs" in row[1]]
    assert posts[0][2][0]["selected_assets"] == {"clips": [2]}
    assert posts[0][2][0]["error_messages"]["_runner_record_projection"] == "v1"
    assert posts[0][2][0]["error_messages"]["Output_Notes"] == "ready"
    assert posts[0][2][0]["content_item_id"] == "content-uuid"


def test_supabase_read_failure_falls_back_to_airtable(monkeypatch):
    def fake_get(url, *, headers, params, timeout):
        return Response({"records": [{"id": "recOutput1", "fields": {"Platform": "TikTok"}}]})

    def fake_request(*_args, **_kwargs):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "request", fake_request)
    rows = _client(studio_runner_output_read_source="supabase").list_records(PLATFORM_OUTPUTS_TABLE)
    assert rows[0]["fields"]["Platform"] == "TikTok"
