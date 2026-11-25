from app import app


def test_internal_drive_rejects_cloudflare_forwarded_ip():
    client = app.test_client()
    response = client.get(
        "/internal/drive-media/abc123",
        headers={"CF-Connecting-IP": "203.0.113.10"},
    )
    assert response.status_code == 403


def test_internal_drive_rejects_docker_ip_by_default():
    client = app.test_client()
    response = client.get(
        "/internal/drive-media/abc123",
        environ_base={"REMOTE_ADDR": "172.18.0.4"},
    )
    assert response.status_code == 403


def test_internal_drive_allows_docker_private_ip_when_enabled(monkeypatch):
    monkeypatch.setenv("ALLOW_DOCKER_INTERNAL", "1")
    client = app.test_client()
    response = client.get(
        "/internal/drive-media/bad.id",
        environ_base={"REMOTE_ADDR": "172.18.0.4"},
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid Drive file ID"


def test_internal_drive_still_rejects_public_ip_when_docker_enabled(monkeypatch):
    monkeypatch.setenv("ALLOW_DOCKER_INTERNAL", "1")
    client = app.test_client()
    response = client.get(
        "/internal/drive-media/abc123",
        environ_base={"REMOTE_ADDR": "8.8.8.8"},
    )
    assert response.status_code == 403

def test_internal_drive_streams_private_source_in_chunks_not_full_memory(monkeypatch):
    import app as runner_app
    import requests

    class FakeDrive:
        def access_token(self):
            return "private-test-token"

    class FakeResponse:
        headers = {"Content-Type": "video/quicktime", "Content-Length": "8"}
        closed = False
        def raise_for_status(self):
            return None
        def iter_content(self, chunk_size):
            assert chunk_size == 1024 * 1024
            yield b"test"
            yield b"data"
        def close(self):
            self.closed = True

    fake = FakeResponse()
    captured = {}
    def get(url, **kwargs):
        captured.update(url=url, params=kwargs.get("params"),
                        headers=kwargs.get("headers"), stream=kwargs.get("stream"))
        return fake

    monkeypatch.setattr(runner_app, "GoogleDriveClient", FakeDrive)
    monkeypatch.setattr(requests, "get", get)
    reply = app.test_client().get(
        "/internal/drive-media/1OeCHnytBPep_IRhvDX4wsM2xuemPmPVt",
        environ_base={"REMOTE_ADDR": "127.0.0.1"},
    )
    assert reply.status_code == 200
    assert reply.data == b"testdata"
    assert reply.headers["Content-Type"].startswith("video/quicktime")
    assert reply.headers["Content-Length"] == "8"
    assert reply.headers["Cache-Control"] == "no-store"
    assert captured["stream"] is True
    assert captured["url"].endswith("1OeCHnytBPep_IRhvDX4wsM2xuemPmPVt")
    assert captured["headers"]["Authorization"] == "Bearer private-test-token"
    assert fake.closed


def test_story_audio_bridge_exact_loopback_only(monkeypatch):
    import hashlib
    import app as runner_app
    from integrations.r2_upload import R2UploadClient
    data=b"verified original narration"
    digest="a"*64
    sha=hashlib.sha256(data).hexdigest()
    path=f"/internal/story-audio/rec9qS53G7HDoyCL5/{digest}/{sha}.mp3"
    calls=[]
    monkeypatch.setattr(runner_app,"pipeline_settings",lambda:{})
    def read(self,key,checksum):
        calls.append((key,checksum))
        assert checksum==sha
        return data
    monkeypatch.setattr(R2UploadClient,"read_story_audio",read)
    client=app.test_client()
    assert client.get(path,headers={"X-Forwarded-For":"203.0.113.1"}).status_code==403
    assert client.get(path,environ_base={"REMOTE_ADDR":"8.8.8.8"}).status_code==403
    assert client.get(path.replace(sha,"invalid")).status_code==400
    assert calls==[]
    response=client.get(path,environ_base={"REMOTE_ADDR":"127.0.0.1"})
    assert response.status_code==200 and response.data==data
    assert response.headers["Cache-Control"]=="private, no-store"
    assert calls==[(f"studio/previews/story-voiceover/rec9qS53G7HDoyCL5/{digest}.mp3",sha)]
