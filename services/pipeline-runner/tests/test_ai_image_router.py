from __future__ import annotations

import requests
import pytest

import ai_image_router
from ai_image_router import post_image_generation
from ai_api_preference import get_preferred_account


@pytest.fixture(autouse=True)
def _silence_primary_alerts(monkeypatch):
    monkeypatch.setattr(ai_image_router, "notify_primary_used", lambda **_kwargs: None)


class _Response:
    def __init__(self, status_code: int, payload=None):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self.text = ""
        self._payload = payload or {"data": [{"b64_json": ""}]}

    def json(self):
        return self._payload


def _settings() -> dict:
    return {
        "openai_api_key_primary": "primary-key",
        "openai_api_key_secondary": "azure-key",
        "openai_secondary_provider": "azure",
        "openai_secondary_endpoint": "https://example.openai.azure.com",
        "openai_secondary_image_api_version": "preview",
        "openai_secondary_image_deployment": "gpt-image-1.5",
    }


def test_azure_preferred_image_uses_azure_endpoint(monkeypatch):
    calls = []
    monkeypatch.setattr(ai_image_router, "get_preferred_account", lambda settings, override=None: "SECONDARY")

    def fake_post(url, headers, json, timeout):
        calls.append((url, headers, json))
        return _Response(200)

    monkeypatch.setattr(requests, "post", fake_post)
    response = post_image_generation(_settings(), {"model": "gpt-image-1.5", "prompt": "x"})
    assert response.ok
    assert len(calls) == 1
    url, headers, body = calls[0]
    assert url.startswith("https://example.openai.azure.com/openai/v1/images/generations")
    assert headers["api-key"] == "azure-key"
    assert "Authorization" not in headers
    assert body["model"] == "gpt-image-1.5"


def test_azure_preferred_missing_image_deployment_fails_closed(monkeypatch):
    settings = _settings()
    settings["openai_secondary_image_deployment"] = ""
    monkeypatch.setattr(ai_image_router, "get_preferred_account", lambda settings, override=None: "SECONDARY")
    called = False

    def fake_post(*args, **kwargs):
        nonlocal called
        called = True
        return _Response(200)

    monkeypatch.setattr(requests, "post", fake_post)
    with pytest.raises(RuntimeError, match="Refusing to fall through to PRIMARY"):
        post_image_generation(settings, {"model": "gpt-image-1.5", "prompt": "x"})
    assert called is False


def test_transient_azure_image_failure_can_fail_over_once(monkeypatch):
    calls = []
    monkeypatch.setattr(ai_image_router, "get_preferred_account", lambda settings, override=None: "SECONDARY")
    monkeypatch.setattr(ai_image_router, "cross_provider_failover_enabled", lambda settings: True)

    def fake_post(url, headers, json, timeout):
        calls.append(url)
        return _Response(503 if len(calls) == 1 else 200)

    monkeypatch.setattr(requests, "post", fake_post)
    response = post_image_generation(_settings(), {"model": "gpt-image-1.5", "prompt": "x"})
    assert response.ok
    assert len(calls) == 2
    assert "/openai/v1/images/generations" in calls[0]
    assert calls[1] == "https://api.openai.com/v1/images/generations"


def test_transient_azure_image_failure_does_not_touch_primary_by_default(monkeypatch):
    calls = []
    monkeypatch.setattr(ai_image_router, "get_preferred_account", lambda settings, override=None: "SECONDARY")
    monkeypatch.setattr(ai_image_router, "cross_provider_failover_enabled", lambda settings: False)

    def fake_post(url, headers, json, timeout):
        calls.append(url)
        return _Response(503)

    monkeypatch.setattr(requests, "post", fake_post)
    response = post_image_generation(_settings(), {"model": "gpt-image-1.5", "prompt": "x"})
    assert response.status_code == 503
    assert len(calls) == 1
    assert "/openai/v1/images/generations" in calls[0]


def test_missing_preferred_azure_config_falls_back_when_enabled(monkeypatch):
    settings = {
        "openai_secondary_provider": "azure",
        "openai_secondary_endpoint": "",
        "openai_secondary_image_deployment": "",
        "ai_api_cross_provider_failover": "true",
        "openai_api_key_primary": "primary-key",
    }

    class Response:
        ok = True
        status_code = 200

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append((url, headers, json))
        return Response()

    monkeypatch.setattr("ai_image_router.requests.post", fake_post)
    monkeypatch.setattr("ai_image_router.get_preferred_account", lambda *_args, **_kwargs: "SECONDARY")
    monkeypatch.setattr("ai_image_router.cross_provider_failover_enabled", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("ai_image_router._alert_if_primary", lambda *args, **kwargs: None)
    monkeypatch.setattr("ai_image_router.record_success", lambda **kwargs: None)

    response = post_image_generation(settings, {"model": "gpt-image-1", "prompt": "test"})
    assert response.ok
    assert len(calls) == 1
    assert calls[0][0] == PRIMARY_IMAGES_URL
