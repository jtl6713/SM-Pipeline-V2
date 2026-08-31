from unittest.mock import MagicMock

from item4.processor import _fail_row, is_retryable_master_error, requeue_stale_processing
from item4.sources import BRIDGE_TOKEN_HEADER, resolve_master_source


class _FakeSettings:
    def get(self, name: str) -> str:
        return {
            "STUDIO_MEDIA_BRIDGE_BASE_URL": "https://bridge.example.workers.dev",
            "STUDIO_MEDIA_BRIDGE_TOKEN": "test-bridge-token",
        }.get(name, "")


def test_master_assets_use_private_media_bridge(monkeypatch):
    captured = {}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["timeout"] = timeout
        response = MagicMock()
        response.status_code = 200
        response.content = b"jpeg-bytes"
        response.headers = {"Content-Type": "image/jpeg"}
        response.raise_for_status = MagicMock()
        return response

    monkeypatch.setattr("item4.sources.requests.get", fake_get)
    content, mime = resolve_master_source(
        {
            "Source_R2_Key": "studio/master-assets/recPR1/abc-chicago-rain-skyline.jpg",
            "Source_URL": "https://media.chicagoshining.com/studio/master-assets/recPR1/abc-chicago-rain-skyline.jpg",
        },
        _FakeSettings(),
    )
    assert content == b"jpeg-bytes"
    assert mime == "image/jpeg"
    assert captured["url"].startswith("https://bridge.example.workers.dev/transfer?key=")
    assert "studio/master-assets/recPR1/abc-chicago-rain-skyline.jpg" in captured["url"]
    assert captured["headers"][BRIDGE_TOKEN_HEADER] == "test-bridge-token"


def test_non_staging_source_still_uses_public_url(monkeypatch):
    captured = {}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        response = MagicMock()
        response.status_code = 200
        response.content = b"preview"
        response.headers = {"Content-Type": "image/jpeg"}
        response.raise_for_status = MagicMock()
        return response

    monkeypatch.setattr("item4.sources.requests.get", fake_get)
    resolve_master_source({"Source_URL": "https://media.chicagoshining.com/studio/previews/x.jpg"})
    assert captured["url"] == "https://media.chicagoshining.com/studio/previews/x.jpg"
    assert not captured["headers"]


def test_fail_row_uses_valid_transfer_status():
    client = MagicMock()
    client.get_record.return_value = {"fields": {}}
    _fail_row(client, "recROW1", "missing folder")
    client.update_record.assert_called_once()
    fields = client.update_record.call_args.args[2]
    assert fields["Transfer_Status"] == "Error"

    client.reset_mock()
    client.get_record.return_value = {"fields": {}}
    _fail_row(client, "recROW1", "404 not found", retryable=True)
    fields = client.update_record.call_args.args[2]
    assert fields["Transfer_Status"] == "Pending"


def test_fail_row_does_not_hide_completed_crop():
    client = MagicMock()
    client.get_record.return_value = {
        "fields": {
            "Drive_File_ID": "1abc",
            "Media_Asset_Record_ID": "recMEDIA1",
            "Transfer_Status": "Ready",
        }
    }
    _fail_row(client, "recROW1", "Variant service failed (503): Worker exceeded resource limits")
    fields = client.update_record.call_args.args[2]
    assert fields["Transfer_Status"] == "Ready"
    assert fields["Error_Message"] is None


def test_retryable_master_errors():
    assert is_retryable_master_error(RuntimeError("Staged object not found via media bridge for key x"))
    assert is_retryable_master_error(RuntimeError("404 Client Error"))
    assert is_retryable_master_error(RuntimeError("Variant service failed (503): Worker exceeded resource limits"))
    assert not is_retryable_master_error(RuntimeError("Master queue row is missing Target_Drive_Folder_ID"))


def test_requeue_stale_processing_returns_pending():
    client = MagicMock()
    client.list_records.return_value = [
        {
            "id": "recSTALE",
            "createdTime": "2026-08-24T03:07:25.000Z",
            "fields": {"Transfer_Status": "Processing", "Attempt_Count": 1},
        }
    ]
    count = requeue_stale_processing(client, production_request_record_id="recPR1")
    assert count == 1
    fields = client.update_record.call_args.args[2]
    assert fields["Transfer_Status"] == "Pending"
