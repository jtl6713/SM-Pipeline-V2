import requests
from fbs1 import poll


def test_fbs2_retries_aborted_r2_upload(monkeypatch):
    calls = []
    class Response:
        status_code = 200
        content = b""
        headers = {}
    def put(*args, **kwargs):
        calls.append(kwargs["params"]["key"])
        if len(calls) == 1:
            raise requests.ConnectionError("ConnectionAbortedError 10053")
        return Response()
    monkeypatch.setattr(poll.requests, "put", put)
    monkeypatch.setattr(poll.time, "sleep", lambda *_: None)
    code, _ = poll._upload_r2(upload_url="https://example.test/upload", upload_secret="x", key="publish/fb/1703.mp4", content=b"mp4")
    assert code == 200
    assert calls == ["publish/fb/1703.mp4", "publish/fb/1703.mp4"]


def test_large_fbs2_upload_uses_multipart(monkeypatch):
    seen = []
    class Response:
        status_code = 200
        def __init__(self, payload):
            self.payload = payload
        def raise_for_status(self):
            return None
        def json(self):
            return self.payload
    def post(_url, params, **kwargs):
        seen.append((params["action"], kwargs.get("json")))
        if params["action"] == "mpu-create":
            return Response({"ok": True, "uploadId": "upload123"})
        if params["action"] == "mpu-complete":
            return Response({"ok": True, "public_url": "https://example.test/video.mp4"})
        return Response({"ok": True})
    def put(_url, params, **kwargs):
        seen.append(("mpu-part", params["partNumber"]))
        return Response({"ok": True, "etag": "etag" + params["partNumber"]})
    monkeypatch.setattr(poll.requests, "post", post)
    monkeypatch.setattr(poll.requests, "put", put)
    status, payload = poll._upload_r2(upload_url="https://example.test", upload_secret="secret",
                  key="publish/facebook-slideshow/platform-output-1703.mp4", content=b"x" * (17 * 1024 * 1024))
    assert status == 200
    assert [name for name, _ in seen] == ["mpu-create", "mpu-part", "mpu-part", "mpu-part", "mpu-complete"]
    assert len(seen[-1][1]["parts"]) == 3
