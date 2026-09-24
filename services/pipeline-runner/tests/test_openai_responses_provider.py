"""OpenAI Responses routing: PRIMARY stays on api.openai.com; Azure is SECONDARY only."""

from __future__ import annotations

import json

import pytest

from config import load_settings
from i1.openai_ideas import generate_ideas
from openai_responses import post_responses

AZURE_URL = "https://nexusoai.openai.azure.com/openai/responses?api-version=2025-04-01-preview"
PRIMARY_URL = "https://api.openai.com/v1/responses"
FAKE_PRIMARY_KEY = "test-primary-key"
FAKE_AZURE_KEY = "test-azure-key"


class _Response:
    ok = True
    status_code = 200
    text = ""

    def json(self):
        return {"output_text": json.dumps({"ok": True})}


@pytest.fixture
def openai_env(monkeypatch):
    def apply(*, account: str, provider: str = ""):
        monkeypatch.setenv("OPENAI_ACCOUNT", account)
        monkeypatch.setenv("OPENAI_API_KEY_PRIMARY", FAKE_PRIMARY_KEY)
        monkeypatch.setenv("OPENAI_API_KEY_SECONDARY", FAKE_AZURE_KEY)
        monkeypatch.setenv("OPENAI_API_KEY", "")
        monkeypatch.setenv("OPENAI_SECONDARY_PROVIDER", provider)
        monkeypatch.setenv("OPENAI_SECONDARY_ENDPOINT", "https://nexusoai.openai.azure.com")
        monkeypatch.setenv("OPENAI_SECONDARY_API_VERSION", "2025-04-01-preview")
        monkeypatch.setenv("OPENAI_SECONDARY_DEPLOYMENT", "gpt-5.4")
        monkeypatch.setenv("OPENAI_I1_MODEL", "gpt-5")
        load_settings.cache_clear()

    yield apply
    load_settings.cache_clear()


def test_primary_uses_openai_bearer_and_stage_model(monkeypatch, openai_env):
    openai_env(account="PRIMARY")
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return _Response()

    monkeypatch.setattr("openai_responses.requests.post", fake_post)
    post_responses(load_settings(), {"model": "gpt-5", "input": "prompt", "store": False}, timeout=300)

    assert captured["url"] == PRIMARY_URL
    assert captured["headers"]["Authorization"] == f"Bearer {FAKE_PRIMARY_KEY}"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert "api-key" not in captured["headers"]
    assert captured["json"]["model"] == "gpt-5"
    assert captured["json"]["input"] == "prompt"
    assert captured["json"]["store"] is False


def test_secondary_azure_uses_api_key_and_deployment(monkeypatch, openai_env):
    openai_env(account="SECONDARY", provider="azure")
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return _Response()

    monkeypatch.setattr("openai_responses.requests.post", fake_post)
    post_responses(load_settings(), {"model": "gpt-5.5", "input": "prompt"}, timeout=300)

    assert captured["url"] == AZURE_URL
    assert captured["headers"]["api-key"] == FAKE_AZURE_KEY
    assert captured["headers"]["Content-Type"] == "application/json"
    assert "Authorization" not in captured["headers"]
    assert FAKE_AZURE_KEY not in captured["headers"].get("Authorization", "")
    assert captured["json"]["model"] == "gpt-5.4"
    assert captured["json"]["input"] == "prompt"


def test_azure_key_is_not_sent_as_bearer(monkeypatch, openai_env):
    openai_env(account="SECONDARY", provider="azure")
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(headers=headers)
        return _Response()

    monkeypatch.setattr("openai_responses.requests.post", fake_post)
    post_responses(load_settings(), {"model": "gpt-5", "input": "prompt"})

    authorization = captured["headers"].get("Authorization", "")
    assert not authorization.lower().startswith("bearer")
    assert FAKE_AZURE_KEY not in authorization


def test_account_switch_changes_provider_without_stage_changes(monkeypatch, openai_env):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=dict(headers), model=json["model"])
        return _Response()

    monkeypatch.setattr("openai_responses.requests.post", fake_post)

    openai_env(account="PRIMARY")
    generate_ideas("primary prompt")
    assert captured["url"] == PRIMARY_URL
    assert captured["headers"]["Authorization"] == f"Bearer {FAKE_PRIMARY_KEY}"
    assert captured["model"] == "gpt-5"

    openai_env(account="SECONDARY", provider="azure")
    generate_ideas("azure prompt")
    assert captured["url"] == AZURE_URL
    assert captured["headers"]["api-key"] == FAKE_AZURE_KEY
    assert "Authorization" not in captured["headers"]
    assert captured["model"] == "gpt-5.4"
