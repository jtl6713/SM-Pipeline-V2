"""Phase 5 runner write-through. No live Airtable or Supabase calls."""

import requests

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


def test_output_update_mirrors_full_airtable_record_and_ignores_missing_outbox(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        seen.append(("airtable", url, json))
        return Response({
            "id": "recOutput1",
            "fields": {
                "Output_ID": 9,
                "Platform": "Instagram",
                "Publish_Status": "Scheduled",
                "Content_Profile": ["recProfile1"],
            },
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json, headers.get("Prefer")))
        if "content_profiles" in url:
            return Response([{"id": "prof-uuid"}])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205","message":"schema cache"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings()).update_record(
        PLATFORM_OUTPUTS_TABLE,
        "recOutput1",
        {"Publish_Status": "Scheduled"},
    )
    assert record["id"] == "recOutput1"
    posts = [row for row in seen if row[0] == "POST" and "platform_outputs" in row[1]]
    assert len(posts) == 1
    assert posts[0][2][0]["airtable_record_id"] == "recOutput1"
    assert posts[0][2][0]["content_profile_id"] == "prof-uuid"
    assert posts[0][2][0]["publish_status"] == "Scheduled"
    assert "resolution=merge-duplicates" in posts[0][3]


def test_other_tables_do_not_call_supabase(monkeypatch):
    called = {"request": 0}

    def fake_patch(url, *, headers, json, timeout):
        return Response({"id": "recMedia", "fields": json["fields"]})

    def fake_request(*_args, **_kwargs):
        called["request"] += 1
        raise AssertionError("supabase should not be called")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    AirtableClient(settings=_settings()).update_record("tblMedia", "recMedia", {"Asset Name": "clip"})
    assert called["request"] == 0


def test_supabase_failure_does_not_fail_airtable_update(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({
        "id": "recOutput1",
        "fields": {"Output_ID": 1, "Platform": "TikTok"},
    }))

    def fake_request(*_args, **_kwargs):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings()).update_record(
        PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Failed"}
    )
    assert record["id"] == "recOutput1"


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
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        "recQueue1",
        {"Transfer_Status": "Ready"},
    )
    assert record["id"] == "recQueue1"
    posts = [row for row in seen if row[0] == "POST" and "studio_media_transfer_queue" in row[1]]
    assert len(posts) == 1
    body = posts[0][2][0]
    assert body["status"] == "Ready"
    assert body["error_message"] is None
    assert body["payload"]["source_drive_file_id"] == "drive-file-9"
    assert body["payload"]["source_media_asset_id"] == "recMedia9"
    assert "source_url" not in body["payload"]
    assert "Source_R2_Key" not in str(body)
    assert "source_media_asset_id" not in body or body.get("source_media_asset_id") is None
    assert not any("studio_media_transfer_targets" in row[1] or "production_request_outputs" in row[1] for row in seen)


def test_queue_update_mirrors_target_links_without_file_bytes(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({
            "id": "recQueue1",
            "fields": {
                "Transfer_Status": "Ready",
                "Target_Production_Request_Outputs": ["recProOutput1", "not-a-record"],
                "Source_URL": "https://example.com/file.jpg",
                "Source_R2_Key": "library/file.jpg",
            },
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if method == "GET" and "studio_media_transfer_queue?" in url:
            return Response([{"id": "11111111-1111-1111-1111-111111111111", "airtable_record_id": "recQueue1"}])
        if method == "GET" and "production_request_outputs?" in url:
            return Response([{"id": "22222222-2222-2222-2222-222222222222", "airtable_record_id": "recProOutput1"}])
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings()).update_record(
        MEDIA_TRANSFER_QUEUE_TABLE,
        "recQueue1",
        {"Target_Production_Request_Outputs": ["recProOutput1"]},
    )
    assert record["id"] == "recQueue1"
    queued = [row for row in seen if row[0] == "POST" and "studio_media_transfer_queue" in row[1]]
    assert queued[0][2][0]["payload"]["target_production_request_output_ids"] == ["recProOutput1"]
    assert "Source_URL" not in str(queued[0][2])
    assert "Source_R2_Key" not in str(queued[0][2])
    anchors = [row for row in seen if row[0] == "POST" and "production_request_outputs" in row[1]]
    assert anchors[0][2] == [{"airtable_record_id": "recProOutput1"}]
    joins = [row for row in seen if row[0] == "POST" and "studio_media_transfer_targets" in row[1]]
    assert joins[0][2] == [{
        "transfer_id": "11111111-1111-1111-1111-111111111111",
        "production_request_output_id": "22222222-2222-2222-2222-222222222222",
    }]
    deletes = [row for row in seen if row[0] == "DELETE" and "studio_media_transfer_targets" in row[1]]
    assert "transfer_id=eq.11111111-1111-1111-1111-111111111111" in deletes[0][1]
    assert seen.index(deletes[0]) < seen.index(joins[0])


def test_queue_supabase_failure_does_not_fail_airtable_update(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({
        "id": "recQueue2",
        "fields": {"Transfer_Status": "Error", "Error_Message": "crop failed"},
    }))

    def fake_request(*_args, **_kwargs):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings()).update_record(
        MEDIA_TRANSFER_QUEUE_TABLE, "recQueue2", {"Transfer_Status": "Error"}
    )
    assert record["fields"]["Transfer_Status"] == "Error"


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


def test_phase6_flag_off_still_requires_airtable_for_request_updates(monkeypatch):
    def fake_patch(*_args, **_kwargs):
        return Response({"error": {"type": "INVALID"}}, status_code=422)

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: Response(""))
    try:
        AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
            PRODUCTION_REQUESTS_TABLE, "recRequest1", {"Request_Status": "Submitted"}
        )
    except requests.HTTPError:
        return
    raise AssertionError("Phase 6 updates must still require Airtable when the phase 6 flag is off")


def test_runner_request_status_patch_does_not_send_omitted_columns(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({
            "id": "recRequest1",
            "fields": {"Request_Status": "Submitted"},
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "studio_side_effect_outbox" in url:
            return Response('{"code":"PGRST205"}', status_code=404)
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings()).update_record(
        PRODUCTION_REQUESTS_TABLE, "recRequest1", {"Request_Status": "Submitted"}
    )
    assert record["id"] == "recRequest1"
    patches = [row for row in seen if row[0] == "PATCH" and "production_requests" in row[1]]
    posts = [row for row in seen if row[0] == "POST" and "production_requests" in row[1]]
    assert posts == []
    assert patches[0][2] == {"request_status": "Submitted"}


def test_runner_media_upsert_drops_catalog_url_and_survives_supabase_failure(monkeypatch):
    seen = []

    def fake_patch(url, *, headers, json, timeout):
        return Response({
            "id": "recMedia9",
            "fields": {
                "Asset Name": "Pier lights",
                "Google Drive File ID": "drive-file-9",
                "Google Drive URL": "https://media.chicagoshining.com/studio/library/pier.jpg",
                "Studio_Favorite": True,
            },
        })

    def fake_request(method, url, *, headers, json, timeout):
        seen.append((method, url, json))
        if "media_assets" in url:
            raise RuntimeError("supabase down")
        return Response("")

    monkeypatch.setattr(requests, "patch", fake_patch)
    monkeypatch.setattr(requests, "request", fake_request)
    record = AirtableClient(settings=_settings(studio_write_source="supabase")).update_record(
        MEDIA_ASSETS_TABLE, "recMedia9", {"Studio_Favorite": True}
    )
    assert record["fields"]["Asset Name"] == "Pier lights"
    posts = [row for row in seen if row[0] == "POST" and "media_assets" in row[1]]
    assert len(posts) == 1
    body = posts[0][2][0]
    assert body["asset_name"] == "Pier lights"
    assert body["google_drive_file_id"] == "drive-file-9"
    assert body["studio_favorite"] is True
    assert "google_drive_url" not in body
    assert body["metadata"]["google_drive_url"] == (
        "https://media.chicagoshining.com/studio/library/pier.jpg"
    )


def test_runner_media_delete_does_not_mirror(monkeypatch):
    monkeypatch.setattr(requests, "delete", lambda *_args, **_kwargs: Response({"deleted": True}))
    monkeypatch.setattr(requests, "request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("supabase")))
    deleted = AirtableClient(settings=_settings()).delete_record(MEDIA_ASSETS_TABLE, "recMedia9")
    assert deleted["deleted"] is True


def test_default_mode_still_raises_airtable_errors(monkeypatch):
    monkeypatch.setattr(requests, "patch", lambda *_args, **_kwargs: Response({"error": "nope"}, status_code=422))
    monkeypatch.setattr(requests, "request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("mirrored")))
    try:
        AirtableClient(settings=_settings()).update_record(
            PLATFORM_OUTPUTS_TABLE, "recOutput1", {"Publish_Status": "Failed"}
        )
    except requests.HTTPError:
        return
    raise AssertionError("expected Airtable HTTPError")


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


def test_request_create_still_requires_airtable(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda url, *, headers, json, timeout: Response({"error": "nope"}, status_code=422))
    monkeypatch.setattr(requests, "request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("supabase")))
    try:
        AirtableClient(settings=_settings(studio_write_source="supabase")).create_records(
            PRODUCTION_REQUESTS_TABLE, [{"Requested_Title": "Pier"}],
        )
    except requests.HTTPError:
        return
    raise AssertionError("request create should still require Airtable")


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


def test_phase6_create_without_identity_still_requires_airtable(monkeypatch):
    monkeypatch.setattr(requests, "post", lambda *_args, **_kwargs: Response({"error": "nope"}, status_code=422))
    monkeypatch.setattr(requests, "request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("supabase")))
    try:
        AirtableClient(settings=_settings(studio_phase6_write_source="supabase")).create_records(
            PRODUCTION_REQUESTS_TABLE, [{"Requested_Title": "Pier"}],
        )
    except requests.HTTPError:
        return
    raise AssertionError("a Phase 6 create without identity must still require Airtable")
