import io

import pytest
from unittest.mock import patch

from integrations.r2_upload import R2UploadClient


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)
        self.ok = 200 <= status_code < 300
        self.content = b"{}"

    def json(self):
        return self._payload


def test_put_file_uses_multipart_above_direct_max(tmp_path, monkeypatch):
    monkeypatch.setattr("integrations.r2_upload.DIRECT_PUT_MAX_BYTES", 32)
    monkeypatch.setattr("integrations.r2_upload.MPU_PART_BYTES", 16)
    path = tmp_path / "clip.mp4"
    size = 40
    path.write_bytes(b"a" * size)
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, kwargs.get("params") or {}))
        action = (kwargs.get("params") or {}).get("action")
        if method == "post" and action == "mpu-create":
            return _FakeResponse({"ok": True, "uploadId": "upl-1"})
        if method == "put" and action == "mpu-part":
            return _FakeResponse({"ok": True, "etag": f"etag-{kwargs['params']['partNumber']}"})
        if method == "post" and action == "mpu-complete":
            return _FakeResponse({"ok": True, "public_url": "https://media.chicagoshining.com/publish/x.mp4"})
        raise AssertionError(f"unexpected {method} {kwargs}")

    client = R2UploadClient()
    with (
        patch.object(client, "_upload_url", return_value="https://r2.example"),
        patch.object(client, "_secret", return_value="secret"),
        patch("integrations.r2_upload.requests.post", side_effect=lambda *a, **k: fake_request("post", *a, **k)),
        patch("integrations.r2_upload.requests.put", side_effect=lambda *a, **k: fake_request("put", *a, **k)),
    ):
        payload = client.put_file("publish/platform-output-375/file.mp4", str(path), "video/mp4")

    assert payload["ok"] is True
    actions = [params.get("action") for _method, params in calls]
    assert actions[0] == "mpu-create"
    assert actions[-1] == "mpu-complete"
    part_count = sum(1 for action in actions if action == "mpu-part")
    assert part_count == 3


def test_put_object_small_stays_direct():
    calls = []

    def fake_put(url, **kwargs):
        calls.append(kwargs)
        return _FakeResponse({"ok": True, "public_url": "https://media.chicagoshining.com/publish/small.mp4"})

    client = R2UploadClient()
    with (
        patch.object(client, "_upload_url", return_value="https://r2.example"),
        patch.object(client, "_secret", return_value="secret"),
        patch("integrations.r2_upload.requests.put", side_effect=fake_put),
    ):
        payload = client.put_object("publish/small.mp4", b"hello", "video/mp4")

    assert payload["ok"] is True
    assert calls[0]["params"] == {"key": "publish/small.mp4"}
    assert "action" not in calls[0]["params"]
    assert isinstance(calls[0]["data"], (bytes, bytearray, io.BytesIO)) or calls[0]["data"] == b"hello"


@pytest.mark.parametrize("status,body,expected", [
    (200, {"ok": True, "object": {"key": "EXACT"}}, True),
    (404, {"ok": False, "error": "Not found", "key": "EXACT"}, False),
    (200, {"ok": False, "error": "Not found", "key": "EXACT"}, False),
    (404, {"ok": False, "error": "Not found", "key": "WRONG"}, None),
    (404, {"ok": False, "error": "Not found"}, None),
    (404, {"ok": True, "object": {"key": "EXACT"}}, None),
    (404, [], None),
    (403, {"ok": False, "error": "Not found", "key": "EXACT"}, None),
    (503, {"ok": False, "error": "Not found", "key": "EXACT"}, None),
    (200, {"ok": True, "object": "EXACT"}, None),
])
def test_story_head_only_accepts_exact_authenticated_receipts(status, body, expected):
    import json
    from unittest.mock import MagicMock
    key = "studio/previews/story-voiceover/recAAAAAAAAAAAAAA/" + "0" * 64 + ".mp3"
    payload = json.loads(json.dumps(body).replace('"EXACT"', json.dumps(key)))
    response = MagicMock()
    response.__enter__.return_value = response
    response.status_code = status
    response.json.return_value = payload
    client = R2UploadClient()
    with (
        patch.object(client, "_upload_url", return_value="https://r2.example"),
        patch.object(client, "_secret", return_value="secret"),
        patch("integrations.r2_upload.requests.get", return_value=response) as get,
    ):
        if expected is None:
            with pytest.raises(RuntimeError):
                client.story_audio_exists(key)
        else:
            assert client.story_audio_exists(key) is expected
        assert get.call_args.kwargs["allow_redirects"] is False
        assert get.call_args.kwargs["params"] == {"key": key}
