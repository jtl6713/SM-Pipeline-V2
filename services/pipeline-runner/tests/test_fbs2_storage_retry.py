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
