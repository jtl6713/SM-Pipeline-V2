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
