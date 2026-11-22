"""Supabase-only runner mutation contracts. Network calls are isolated fakes."""

import json

import requests
import pytest

from airtable.client import AirtableClient
from airtable.constants import (
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    MEDIA_TRANSFER_QUEUE_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
)
from supabase_pipeline import mirror_airtable_records


class Response:
    def __init__(self, data, *, status_code=200):
        self.data = data
        self.status_code = status_code
        self.ok = status_code < 400
        self.reason = "OK" if self.ok else "Error"
        self.text = "" if data is None else (data if isinstance(data, str) else __import__("json").dumps(data))

    def json(self):
        if isinstance(self.data, str):
            raise ValueError("not json")
        return self.data

    def raise_for_status(self):
        if not self.ok:
            raise requests.HTTPError(self.reason)


def _settings(**extra):
    base = {
        "airtable_pat": "test",
        "airtable_base_id": "appTest123",
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "sb_secret_test",
        "studio_write_source": "airtable",
    }
    base.update(extra)
    return base


def test_output_update_uses_supabase_patch_without_legacy_record_enrichment(monkeypatch):
    seen = []
    def deny_airtable(*_args, **_kwargs):
        raise AssertionError("retired Airtable write")
    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        if method == "GET" and "platform_outputs" in url and "error_messages" in url:
            return Response([{"error_messages": {}}])
        return Response("")
    monkeypatch.setattr(requests, "patch", deny_airtable)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Scheduled"}
    )
    assert record == {"id": "recOutput1", "fields": {"Publish_Status": "Scheduled"}}
    patches = [x for x in seen if x[0] == "PATCH" and "platform_outputs" in x[1]]
    assert len(patches) == 1
    assert patches[0][2]["publish_status"] == "Scheduled"
    # The typed status invalidates any stale Airtable-era value in the JSON bag.
    assert patches[0][2]["error_messages"] == {}

def test_unmapped_table_update_fails_closed_without_airtable(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("unexpected Supabase mapping")))
    with pytest.raises(RuntimeError, match="Supabase update uncommitted"):
        AirtableClient(settings=_settings()).update_record("tblMedia", "recMedia", {"Asset Name": "clip"})

def test_supabase_failure_blocks_update_instead_of_using_airtable(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable write")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase"):
        AirtableClient(settings=_settings()).update_record(
            PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Failed"}
        )

def test_unconfigured_supabase_skips_mirror(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({
        "id": "recOutput1",
        "fields": {"Output_ID": 1, "Platform": "TikTok"},
    }))
    monkeypatch.setattr(requests, "request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("called")))
    result = mirror_airtable_records(
        {"supabase_url": "", "supabase_service_role_key": ""},
        PLATFORM_OUTPUTS_TABLE,
        [{"id": "recOutput1", "fields": {"Output_ID": 1, "Platform": "TikTok"}}],
    )
    assert result["reason"] == "supabase_not_configured"


def test_legacy_export_keeps_going_when_airtable_update_fails(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({"error": "nope"}, status_code=422)

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        CONTENT_ITEMS_TABLE,
        "recContent1",
        {"Content_Status": "Thumbnail Ready"},
    )
    assert record["id"] == "recContent1"
    assert record["fields"]["Content_Status"] == "Thumbnail Ready"
    patches = [row for row in seen if row[0] == "PATCH" and "content_items" in row[1]]
    assert patches[0][2]["content_status"] == "Thumbnail Ready"
    assert "content_profile_id" not in patches[0][2]


def test_queue_update_mirrors_status_and_drive_id_without_source_urls(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({
            "id": "recQueue1",
            "fields": {
                "Transfer_Status": "Ready",
                "Error_Message": None,
                "Source_Drive_File_ID": "drive-file-9",
                "Source_URL": "https://media.chicagoshining.com/studio/library/pier.jpg",
                "Source_R2_Key": "library/pier.jpg",
                "Source_Media_Asset": ["recMedia9"],
                "Preview_Status": "Pending",
            },
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if method == "GET" and "studio_media_transfer_queue?" in url and "select=payload" in url:
            return Response([{"airtable_record_id": "recQueue1", "payload": {"transfer_id": "keep"}}])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    # Production has Phase 6 write SoR on; queue commits to Supabase and skips Airtable.
    record = AirtableClient(settings=_settings(
        studio_write_source="supabase",
        studio_phase6_write_source="supabase",
    )).update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        "recQueue1",
        {"Transfer_Status": "Ready"},
    )
    assert record["id"] == "recQueue1"
    assert record["fields"] == {"Transfer_Status": "Ready"}
    # fake_patch raises if Airtable were contacted; seen is Supabase-only.
    posts = [row for row in seen if row[0] == "POST" and "studio_media_transfer_queue" in row[1]]
    assert len(posts) == 1
    body = posts[0][2][0]
    # Phase 6 SoR-first commits the patch fields only (no Airtable round-trip enrichment).
    assert body["airtable_record_id"] == "recQueue1"
    assert body["status"] == "Ready"
    assert "source_url" not in str(body)
    assert "Source_R2_Key" not in str(body)
    assert not any("studio_media_transfer_targets" in row[1] or "production_request_outputs" in row[1] for row in seen)


def test_queue_ready_update_merges_existing_payload(monkeypatch):
    """Partial Ready patches must keep Transfer_ID / Production_Request_Record_ID."""
    seen = []

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if method == "GET" and "studio_media_transfer_queue?" in url and "select=payload" in url:
            return Response([{
                "airtable_record_id": "recQueueMerge",
                "payload": {
                    "transfer_id": "ITEM4-VARIANT-keep-me",
                    "production_request_record_id": "recPR1",
                    "asset_kind": "Platform Variant",
                    "target_drive_folder_id": "folder1",
                },
            }])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Airtable closed")))
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(
        studio_write_source="supabase",
        studio_phase6_write_source="supabase",
    )).update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        "recQueueMerge",
        {
            "Transfer_Status": "Ready",
            "Generated_Media_Asset": ["recMediaReady"],
            "Preview_Status": "Pending",
        },
    )
    assert record["id"] == "recQueueMerge"
    posts = [row for row in seen if row[0] == "POST" and "studio_media_transfer_queue" in row[1]]
    assert len(posts) == 1
    payload = posts[0][2][0]["payload"]
    assert payload["transfer_id"] == "ITEM4-VARIANT-keep-me"
    assert payload["production_request_record_id"] == "recPR1"
    assert payload["target_drive_folder_id"] == "folder1"
    assert payload["generated_media_asset_id"] == "recMediaReady"
    assert payload["preview_status"] == "Pending"


def test_queue_link_update_cannot_soft_succeed_without_supabase_commit(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable write")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase"):
        AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
            MEDIA_TRANSFER_QUEUE_TABLE, "recQueue1",
            {"Target_Production_Request_Outputs": ["recProOutput1"]},
        )

def test_queue_supabase_failure_blocks_state_change(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable write")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase"):
        AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
            MEDIA_TRANSFER_QUEUE_TABLE, "recQueue2", {"Transfer_Status": "Error"}
        )

def test_phase6_request_update_keeps_supabase_row_when_airtable_fails(monkeypatch):
    seen = []

    def fake_patch(*_args, **_kwargs):
        return Response({"error": {"type": "INVALID"}}, status_code=422)

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
        PRODUCTION_REQUESTS_TABLE, "recRequest1", {"Request_Status": "Submitted"}
    )
    assert record["id"] == "recRequest1"
    assert record["fields"]["Request_Status"] == "Submitted"
    patches = [row for row in seen if row[0] == "PATCH" and "production_requests" in row[1]]
    assert patches[0][2] == {"request_status": "Submitted"}


def test_phase6_flag_off_never_restores_airtable_or_fabricates_request_patch(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable write")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("unmapped write")))
    with pytest.raises(RuntimeError, match="Supabase update uncommitted"):
        AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
            PRODUCTION_REQUESTS_TABLE, "recRequest1", {"Request_Status": "Submitted"}
        )

def test_runner_request_status_patch_does_not_send_omitted_columns(monkeypatch):
    seen = []
    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable")))
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
        PRODUCTION_REQUESTS_TABLE, "recRequest1", {"Request_Status": "Submitted"}
    )
    assert record["id"] == "recRequest1"
    patches = [row for row in seen if row[0] == "PATCH" and "production_requests" in row[1]]
    assert patches and patches[0][2] == {"request_status": "Submitted"}

def test_phase6_produce_job_patch_persists_production_job(monkeypatch):
    """A themes→audio step write is only Studio_Production_Job_JSON. It must land."""
    seen = []

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    def fail_airtable(*_args, **_kwargs):
        raise AssertionError("airtable patch")

    monkeypatch.setattr(requests, "patch", fail_airtable)
    monkeypatch.setattr(requests, "request", fake_request)
    job = json.dumps({"step": "audio", "job_id": "spj-test", "percent": 20})
    record = AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
        PRODUCTION_REQUESTS_TABLE,
        "recRequest1",
        {"Studio_Production_Job_JSON": job},
    )
    assert record["id"] == "recRequest1"
    patches = [row for row in seen if row[0] == "PATCH" and "production_requests" in row[1]]
    assert len(patches) == 1
    assert patches[0][2] == {"production_job": {"step": "audio", "job_id": "spj-test", "percent": 20}}


def test_runner_media_patch_densifies_content_profile_and_notes(monkeypatch):
    """A3 Classification_Status + Content_Profile must land in metadata densify."""
    seen = []

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "media_assets" in url and method == "GET":
            return Response([{
                "metadata": {
                    "studio_transfer_id": "LIB-1",
                    "content_profile_airtable_id": "recOldProfile00001",
                },
            }])
        return Response("")

    monkeypatch.setattr(
        requests,
        "patch",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("airtable")),
    )
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(
        studio_write_source="supabase",
        studio_phase6_write_source="supabase",
    )).update_record(
        MEDIA_ASSETS_TABLE,
        "recMediaProfile01",
        {
            "Content_Profile": ["recT2rbKX3MF7cVFU"],
            "Classification_Status": "Processing",
            "Potential_Match_Notes": "A3 stalled; re-queued",
            "Search_Keywords": "speakeasy",
        },
    )
    assert record["id"] == "recMediaProfile01"
    patches = [row for row in seen if row[0] == "PATCH" and "media_assets" in row[1]]
    assert patches
    meta = patches[0][2]["metadata"]
    assert meta["content_profile_airtable_id"] == "recT2rbKX3MF7cVFU"
    assert meta["classification_status"] == "Processing"
    assert meta["potential_match_notes"] == "A3 stalled; re-queued"
    assert meta["search_keywords"] == "speakeasy"
    assert meta["studio_transfer_id"] == "LIB-1"


def test_media_patch_failure_cannot_fall_back_to_airtable(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable write")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase"):
        AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).update_record(
            MEDIA_ASSETS_TABLE, "recMedia9", {"Studio_Favorite": True}
        )

def test_runner_media_delete_requires_confirmed_supabase_row(monkeypatch):
    import supabase_pipeline
    seen = []
    def deny_airtable(*_args, **_kwargs):
        raise AssertionError("retired Airtable delete")
    def fake_rest(_settings, path, method, body=None, *, prefer=None):
        seen.append((path, method, prefer))
        return [{"airtable_record_id": "recMedia9"}]
    monkeypatch.setattr(requests, "delete", deny_airtable)
    monkeypatch.setattr(supabase_pipeline, "_rest", fake_rest)
    deleted = AirtableClient(settings=_settings()).delete_record(MEDIA_ASSETS_TABLE, "recMedia9")
    assert deleted == {"id": "recMedia9", "deleted": True}
    assert seen[0][1:] == ("DELETE", "return=representation")

def test_default_mode_reports_uncommitted_supabase_instead_of_airtable_error(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase"):
        AirtableClient(settings=_settings()).update_record(
            PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Failed"}
        )

def _supabase_request_log(seen):
    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response([])
    return fake_request


def test_output_create_keeps_supabase_row_when_airtable_fails(monkeypatch):
    seen = []
    monkeypatch.setattr(requests, "post", lambda url, *, headers, json, timeout: Response({"error": "nope"}, status_code=422))
    monkeypatch.setattr(requests, "request", _supabase_request_log(seen))
    rows = AirtableClient(settings=_settings(studio_write_source="supabase")).create_records(
        PLATFORM_OUTPUTS_TABLE, [{"Platform": "TikTok"}],
    )
    assert rows[0]["fields"]["Platform"] == "TikTok"
    assert rows[0]["id"].startswith("rec")
    assert len(rows[0]["id"]) == 17
    posts = [row for row in seen if row[0] == "POST" and "platform_outputs" in row[1]]
    assert posts[0][2][0]["airtable_record_id"] == rows[0]["id"]
    assert posts[0][2][0]["platform"] == "TikTok"


def test_idea_batch_create_stays_on_supabase(monkeypatch):
    from airtable.constants import IDEA_BATCHES_TABLE

    seen = []
    monkeypatch.setattr(
        requests, "post",
        lambda url, *, headers, json, timeout: (_ for _ in ()).throw(AssertionError("airtable export")),
    )
    monkeypatch.setattr(requests, "request", _supabase_request_log(seen))
    rows = AirtableClient(settings=_settings(studio_write_source="supabase")).create_records(
        IDEA_BATCHES_TABLE,
        [{"Batch_ID": "IDEAS-TEST", "Status": "Pending", "Requested_Count": 2, "Quality": "Highest Quality"}],
    )
    assert rows[0]["id"].startswith("rec")
    assert len(rows[0]["id"]) == 17
    posts = [row for row in seen if row[0] == "POST" and "idea_batches" in row[1]]
    assert posts
    assert posts[0][2][0]["batch_id"] == "IDEAS-TEST"
    assert posts[0][2][0]["airtable_record_id"] == rows[0]["id"]


def test_output_create_keeps_minted_id_when_airtable_is_archived(monkeypatch):
    seen = []
    monkeypatch.setattr(
        requests, "post",
        lambda url, *, headers, json, timeout: (_ for _ in ()).throw(AssertionError("airtable export")),
    )
    monkeypatch.setattr(requests, "request", _supabase_request_log(seen))
    rows = AirtableClient(settings=_settings(studio_write_source="supabase")).create_records(
        PLATFORM_OUTPUTS_TABLE, [{"Platform": "TikTok"}],
    )
    assert rows[0]["id"].startswith("rec")
    assert len(rows[0]["id"]) == 17
    assert rows[0]["fields"]["Platform"] == "TikTok"
    assert not any(row[0] == "DELETE" for row in seen)
    posts = [row for row in seen if row[0] == "POST" and "platform_outputs" in row[1]]
    assert posts[0][2][0]["airtable_record_id"] == rows[0]["id"]


def test_request_create_without_phase6_supabase_authority_fails_closed(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable create")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("unmapped Supabase create")))
    with pytest.raises(RuntimeError, match="Supabase create uncommitted"):
        AirtableClient(settings=_settings(studio_write_source="supabase")).create_records(
            PRODUCTION_REQUESTS_TABLE, [{"Requested_Title": "Pier"}]
        )

def test_phase6_request_create_keeps_supabase_row_when_airtable_fails(monkeypatch):
    seen = []

    def fake_post(*_args, **_kwargs):
        return Response({"error": {"type": "INVALID"}}, status_code=422)

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests, "request", fake_request)
    records = AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).create_records(
        PRODUCTION_REQUESTS_TABLE,
        [{"Production_Request_ID": "900", "Request_Status": "Draft", "Requested_Title": "Pier"}],
    )
    assert records[0]["id"].startswith("rec")
    assert records[0]["fields"]["Request_Status"] == "Draft"
    posts = [row for row in seen if row[0] == "POST" and "production_requests" in row[1]]
    assert posts
    assert posts[0][2][0]["request_status"] == "Draft"
    assert posts[0][2][0]["airtable_record_id"] == records[0]["id"]


def test_phase6_create_without_confirmed_supabase_commit_is_rejected(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("Airtable create")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase create uncommitted"):
        AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).create_records(
            PRODUCTION_REQUESTS_TABLE, [{"Requested_Title": "Pier"}]
        )

def test_partial_ttd1_output_mirror_merges_publish_id_into_bag(monkeypatch):
    """TTD1 stamps Processing + publish_id without Platform/Output_ID. Bag must merge."""
    seen = []

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if method == "GET" and "select=error_messages" in url:
            return Response([{
                "error_messages": {
                    "_runner_record_projection": "v1",
                    "Output_Notes": "keep-me",
                },
            }])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        PLATFORM_OUTPUTS_TABLE,
        "recOutputTtd1",
        {
            "Publish_Status": "Publishing",
            "TikTok_Draft_Status": "Processing",
            "TikTok_Draft_Publish_ID": "p_inbox_url~v2.example",
            "TikTok_Draft_Response_JSON": '{"ok":true,"publish_id":"p_inbox_url~v2.example"}',
            "Publish_Error_Message": "",
        },
    )
    assert record["id"] == "recOutputTtd1"
    patches = [row for row in seen if row[0] == "PATCH" and "platform_outputs" in row[1]]
    assert patches, "partial TTD1 mirror must PATCH platform_outputs"
    body = patches[0][2]
    assert body["publish_status"] == "Publishing"
    assert body["tiktok_draft_status"] == "Processing"
    assert body["error_messages"]["TikTok_Draft_Publish_ID"] == "p_inbox_url~v2.example"
    assert body["error_messages"]["Output_Notes"] == "keep-me"
    assert body["error_messages"]["_runner_record_projection"] == "v1"
    assert "TikTok_Draft_Publish_ID" not in body  # bag only, not a typed column
    assert "Publish_Error_Message" not in body["error_messages"]



def test_ap1c_success_clears_sparse_locks_without_erasing_child_receipts(monkeypatch):
    """#2464: AP1C unlock_fields() None must remove stale Supabase lock bag keys."""
    from apc.common import unlock_fields

    seen = []
    original_bag = {
        "Publish_Locked_At": "2026-11-21T21:01:14Z",
        "Publish_Started_At": "2026-11-21T21:01:14Z",
        "Publish_Locked_By": "AP1C",
        "IG_Carousel_Children_JSON": '{"created_count":4,"verified_at":"2026-11-21T21:01:38Z"}',
        "IG_Carousel_Last_Completed_Stage": "AP1C",
        "Output_Notes": "approved media: unchanged",
    }

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if method == "GET" and "select=error_messages" in url:
            return Response([{"error_messages": original_bag}])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        PLATFORM_OUTPUTS_TABLE,
        "recCarouselAp1c1",
        {
            **unlock_fields(),
            "IG_Carousel_Status": "Children Processing",
            "IG_Carousel_Children_JSON": original_bag["IG_Carousel_Children_JSON"],
            "IG_Carousel_Last_Completed_Stage": "AP1C",
        },
    )
    assert record["id"] == "recCarouselAp1c1"
    patches = [x for x in seen if x[0] == "PATCH" and "platform_outputs" in x[1]]
    assert len(patches) == 1
    body = patches[0][2]
    assert body["ig_carousel_status"] == "Children Processing"
    bag = body["error_messages"]
    assert "Publish_Locked_At" not in bag
    assert "Publish_Started_At" not in bag
    assert "Publish_Locked_By" not in bag
    assert bag["IG_Carousel_Children_JSON"] == original_bag["IG_Carousel_Children_JSON"]
    assert bag["IG_Carousel_Last_Completed_Stage"] == "AP1C"
    assert bag["Output_Notes"] == "approved media: unchanged"


def test_supabase_side_table_failure_is_explicit_and_never_uses_airtable(monkeypatch):
    from airtable.constants import CAROUSEL_SLIDES_TABLE
    monkeypatch.setattr(requests, "patch", lambda *_a, **_k: (_ for _ in ()).throw(
        AssertionError("Airtable archive accessed")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(
        RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase update uncommitted.*no Airtable fallback"):
        AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
            CAROUSEL_SLIDES_TABLE, "recSlide1", {"Current Order": 2}
        )


def test_supabase_phase6_create_failure_never_claims_minted_asset_id(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *_a, **_k: (_ for _ in ()).throw(
        AssertionError("Airtable archive accessed")))
    monkeypatch.setattr(requests, "request", lambda *_a, **_k: (_ for _ in ()).throw(
        RuntimeError("Supabase unavailable")))
    with pytest.raises(RuntimeError, match="Supabase create uncommitted.*no Airtable fallback"):
        AirtableClient(settings=_settings(
            studio_write_source="supabase",
            studio_phase6_write_source="supabase",
        )).create_records(MEDIA_ASSETS_TABLE, [{"Asset Name": "Never minted"}])
