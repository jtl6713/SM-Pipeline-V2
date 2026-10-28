"""Hermetic regression tests for TikTok's full-video CDN integrity guard."""
import hashlib

import pytest
from ttd import video_integrity as guard

MP4 = b"\x00\x00\x00\x18ftypisom" + (b"frame-data-" * 200)
URL = "https://media.chicagoshining.com/publish/platform-output-3129/master.mp4"


class FakeResponse:
    def __init__(self, body, code=200, headers=None):
        self.body = body
        self.status_code = code
        self.headers = {"Content-Length": str(len(body))} if headers is None else headers

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def iter_content(self, chunk_size):
        mid = len(self.body) // 2
        yield self.body[:mid]
        yield self.body[mid:]


def mock_drive(monkeypatch, content=MP4):
    class Drive:
        def download_file_to_path(self, file_id, path):
            assert file_id == "DRIVE_ID"
            with open(path, "wb") as fp:
                fp.write(content)
            return path, "video/mp4"

    monkeypatch.setattr(guard, "GoogleDriveClient", Drive)


def test_complete_tiktok_video_matches_exact_drive_bytes(monkeypatch):
    mock_drive(monkeypatch)

    def fake_get(url, **kwargs):
        assert url == URL
        assert kwargs["stream"] and kwargs["allow_redirects"] is False
        return FakeResponse(MP4)

    monkeypatch.setattr(guard.requests, "get", fake_get)
    assert guard.verify_public_video_matches_drive(URL, "DRIVE_ID") == {
        "bytes": len(MP4), "sha256": hashlib.sha256(MP4).hexdigest(),
    }


def test_first_scene_only_is_rejected_even_if_http_200(monkeypatch):
    mock_drive(monkeypatch)
    monkeypatch.setattr(guard.requests, "get", lambda *_a, **_kw: FakeResponse(MP4[:600], headers={}))
    with pytest.raises(RuntimeError, match="incomplete"):
        guard.verify_public_video_matches_drive(URL, "DRIVE_ID")


def test_corruption_same_byte_length_is_rejected(monkeypatch):
    mock_drive(monkeypatch)
    changed = MP4[:500] + b"broken" + MP4[506:]
    assert len(changed) == len(MP4)
    monkeypatch.setattr(guard.requests, "get", lambda *_a, **_kw: FakeResponse(changed))
    with pytest.raises(RuntimeError, match="SHA-256 mismatch"):
        guard.verify_public_video_matches_drive(URL, "DRIVE_ID")


def test_head_only_or_range_only_response_is_rejected(monkeypatch):
    mock_drive(monkeypatch)
    monkeypatch.setattr(guard.requests, "get", lambda *_a, **_kw: FakeResponse(MP4[:1], code=206))
    with pytest.raises(RuntimeError, match="HTTP 200"):
        guard.verify_public_video_matches_drive(URL, "DRIVE_ID")


def test_redirect_rejected_without_fetching_location(monkeypatch):
    mock_drive(monkeypatch)
    monkeypatch.setattr(guard.requests, "get", lambda *_a, **_kw: FakeResponse(b"", code=302))
    with pytest.raises(RuntimeError, match="without redirect"):
        guard.verify_public_video_matches_drive(URL, "DRIVE_ID")


def test_announced_size_mismatch_rejected_before_download(monkeypatch):
    mock_drive(monkeypatch)
    monkeypatch.setattr(guard.requests, "get", lambda *_a, **_kw: FakeResponse(MP4[:1], headers={"Content-Length": "1"}))
    with pytest.raises(RuntimeError, match="length mismatch"):
        guard.verify_public_video_matches_drive(URL, "DRIVE_ID")


def test_public_host_enforced_before_drive_or_network(monkeypatch):
    with pytest.raises(ValueError, match="owned public media host"):
        guard.verify_public_video_matches_drive("https://bad.example/master.mp4", "DRIVE_ID")
