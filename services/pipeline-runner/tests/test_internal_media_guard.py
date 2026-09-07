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
