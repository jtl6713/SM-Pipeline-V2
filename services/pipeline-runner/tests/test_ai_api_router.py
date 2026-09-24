"""Automatic failover behavior for the OpenAI/Azure Responses router."""

from __future__ import annotations

import requests

import ai_api_router


class _Response:
    def __init__(self, status_code: int):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self.text = ""


def test_openai_preferred_success_does_not_call_azure(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="OpenAI")
    assert response.status_code == 200
    assert calls == ["PRIMARY"]


def test_openai_429_fails_over_once_to_azure(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(429 if len(calls) == 1 else 200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="OpenAI")
    assert response.status_code == 200
    assert calls == ["PRIMARY", "SECONDARY"]


def test_openai_500_fails_over_once_to_azure(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(500 if len(calls) == 1 else 200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="OpenAI")
    assert response.status_code == 200
    assert calls == ["PRIMARY", "SECONDARY"]


def test_timeout_fails_over_once(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        if len(calls) == 1:
            raise requests.Timeout("simulated")
        return _Response(200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="OpenAI")
    assert response.status_code == 200
    assert calls == ["PRIMARY", "SECONDARY"]


def test_400_does_not_fail_over(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(400)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="OpenAI")
    assert response.status_code == 400
    assert calls == ["PRIMARY"]


def test_azure_preferred_success_does_not_call_openai(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="Azure")
    assert response.status_code == 200
    assert calls == ["SECONDARY"]


def test_azure_429_fails_over_once_to_openai(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(429 if len(calls) == 1 else 200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="Azure")
    assert response.status_code == 200
    assert calls == ["SECONDARY", "PRIMARY"]


def test_both_fail_without_bouncing(monkeypatch):
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(503)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    response = ai_api_router.post_responses({}, {"model": "gpt-5"}, preferred_account="Azure")
    assert response.status_code == 503
    assert calls == ["SECONDARY", "PRIMARY"]
