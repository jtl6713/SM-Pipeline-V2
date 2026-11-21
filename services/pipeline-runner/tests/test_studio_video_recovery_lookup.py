"""Read-only original AI video Drive lookup must use Runner OAuth, never mutate."""
import app as runner


FILENAME = "New-York-City-Then-and-Now-Scene-4-deadbeef.mp4"
PATH = "/jobs/studio-asset-library/recovery-lookup"


def test_lookup_uses_runner_google_identity_and_requires_shared_secret(monkeypatch):
    calls = []
    class Drive:
        def list_files(self, **kwargs):
            calls.append(kwargs)
            return [{
                "id": "1aaaaaaaaaaaaaaa", "name": FILENAME,
                "mimeType": "video/mp4", "size": "12500",
                "parents": ["video-folder"], "trashed": False,
                "webViewLink": "not-returned",
            }]
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    monkeypatch.setattr(runner, "GoogleDriveClient", Drive)
    client = runner.app.test_client()

    unauthorized = client.get(PATH, query_string={"filename": FILENAME})
    assert unauthorized.status_code == 401
    assert not calls

    reply = client.get(PATH, query_string={"filename": FILENAME},
                       headers={"X-Pipeline-Secret": "test-secret"})
    assert reply.status_code == 200
    payload = reply.get_json()
    assert payload["ok"] is True and payload["complete"] is True
    assert len(payload["files"]) == 1
    assert payload["files"][0]["name"] == FILENAME
    assert "webViewLink" not in payload["files"][0]
    assert reply.headers["Cache-Control"] == "no-store"
    assert len(calls) == 1
    assert calls[0]["query"] == f"name = '{FILENAME}' and trashed = false"
    assert calls[0]["fields"] == "files(id,name,mimeType,size,trashed,parents)"


def test_lookup_refuses_missing_auth_configuration(monkeypatch):
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "")
    called = []
    monkeypatch.setattr(runner, "GoogleDriveClient", lambda: called.append("called"))
    reply = runner.app.test_client().get(PATH, query_string={"filename": FILENAME})
    assert reply.status_code == 503
    assert reply.get_json()["error"] == "runner_auth_unconfigured"
    assert not called


def test_lookup_rejects_unsafe_filename_without_drive_request(monkeypatch):
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    called = []
    monkeypatch.setattr(runner, "GoogleDriveClient", lambda: called.append("called"))
    client = runner.app.test_client()
    for filename in ["", "../evil.mp4", "x' or trashed = false", "x-Scene-4-abc.mp4",
                     "x-Scene-4-deadbeef.mp4'"]:
        reply = client.get(PATH, query_string={"filename": filename},
                           headers={"X-Pipeline-Secret": "test-secret"})
        assert reply.status_code == 422
    assert not called


def test_lookup_drive_failure_and_bad_results_fail_closed(monkeypatch):
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    client = runner.app.test_client()
    class Down:
        def list_files(self, **_kwargs):
            raise RuntimeError("Drive lookup offline")
    monkeypatch.setattr(runner, "GoogleDriveClient", Down)
    reply = client.get(PATH, query_string={"filename": FILENAME},
                       headers={"X-Pipeline-Secret": "test-secret"})
    assert reply.status_code == 503
    assert reply.get_json()["error"] == "drive_lookup_unavailable"

    class Incomplete:
        def list_files(self, **_kwargs):
            return ["unknown-metadata"]
    monkeypatch.setattr(runner, "GoogleDriveClient", Incomplete)
    reply = client.get(PATH, query_string={"filename": FILENAME},
                       headers={"X-Pipeline-Secret": "test-secret"})
    assert reply.status_code == 503
    assert reply.get_json()["error"] == "drive_lookup_incomplete"
