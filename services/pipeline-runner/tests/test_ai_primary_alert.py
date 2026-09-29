"""PRIMARY OpenAI usage alerts: stage, email allowlist, cooldown, desk ticket."""

from __future__ import annotations

import ai_api_router
import ai_image_router
import ai_primary_alert
from integrations.gmail import PURPOSE_PRIMARY_AI_USAGE, ALLOWED_EMAIL_PURPOSES


class _Response:
    def __init__(self, status_code: int):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self.text = ""


def test_primary_ai_usage_purpose_is_allowlisted():
    assert PURPOSE_PRIMARY_AI_USAGE == "primary_ai_usage"
    assert PURPOSE_PRIMARY_AI_USAGE in ALLOWED_EMAIL_PURPOSES


def test_notify_primary_used_emails_and_tickets(monkeypatch):
    emails = []
    desks = []

    monkeypatch.setattr(ai_primary_alert, "COOLDOWN_SECONDS", 0)
    with ai_primary_alert._lock:
        ai_primary_alert._last_alert_at.clear()
        ai_primary_alert._suppressed.clear()

    monkeypatch.setattr(
        ai_primary_alert,
        "_send_email",
        lambda **kwargs: emails.append(kwargs) or {"ok": True},
    )
    monkeypatch.setattr(
        ai_primary_alert,
        "_post_desk_incident",
        lambda **kwargs: desks.append(kwargs) or {"ok": True, "fingerprint": "x"},
    )

    result = ai_primary_alert.notify_primary_used(
        stage="P2",
        kind="images",
        model="gpt-image-1.5",
        preferred_provider="Azure",
        failover=True,
        status_code=200,
    )
    assert result["notified"] is True
    assert len(emails) == 1
    assert "P2" in emails[0]["subject"]
    assert desks and desks[0]["stage"] == "P2"
    assert desks[0]["failover"] is True


def test_notify_primary_used_respects_cooldown(monkeypatch):
    emails = []
    monkeypatch.setattr(ai_primary_alert, "COOLDOWN_SECONDS", 3600)
    with ai_primary_alert._lock:
        ai_primary_alert._last_alert_at.clear()
        ai_primary_alert._suppressed.clear()
    monkeypatch.setattr(
        ai_primary_alert,
        "_send_email",
        lambda **kwargs: emails.append(kwargs) or {"ok": True},
    )
    monkeypatch.setattr(
        ai_primary_alert,
        "_post_desk_incident",
        lambda **kwargs: {"ok": True},
    )

    first = ai_primary_alert.notify_primary_used(stage="A3", kind="responses", preferred_provider="OpenAI")
    second = ai_primary_alert.notify_primary_used(stage="A3", kind="responses", preferred_provider="OpenAI")
    assert first["notified"] is True
    assert second["notified"] is False
    assert second["email_reason"] == "cooldown"
    assert len(emails) == 1


def test_responses_router_alerts_on_primary(monkeypatch):
    alerts = []

    def fake_post(settings, body, timeout=300):
        return _Response(200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    monkeypatch.setattr(
        ai_api_router,
        "notify_primary_used",
        lambda **kwargs: alerts.append(kwargs),
    )
    response = ai_api_router.post_responses(
        {},
        {"model": "gpt-5"},
        preferred_account="OpenAI",
        stage="I1",
    )
    assert response.status_code == 200
    assert len(alerts) == 1
    assert alerts[0]["stage"] == "I1"
    assert alerts[0]["failover"] is False


def test_responses_router_does_not_alert_on_azure_only(monkeypatch):
    alerts = []

    def fake_post(settings, body, timeout=300):
        return _Response(200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    monkeypatch.setattr(
        ai_api_router,
        "notify_primary_used",
        lambda **kwargs: alerts.append(kwargs),
    )
    response = ai_api_router.post_responses(
        {},
        {"model": "gpt-5"},
        preferred_account="Azure",
        stage="P1",
    )
    assert response.status_code == 200
    assert alerts == []


def test_responses_failover_to_primary_alerts(monkeypatch):
    alerts = []
    calls = []

    def fake_post(settings, body, timeout=300):
        calls.append(settings["openai_account"])
        return _Response(429 if len(calls) == 1 else 200)

    monkeypatch.setattr(ai_api_router, "_post_responses", fake_post)
    monkeypatch.setattr(ai_api_router, "cross_provider_failover_enabled", lambda settings: True)
    monkeypatch.setattr(
        ai_api_router,
        "notify_primary_used",
        lambda **kwargs: alerts.append(kwargs),
    )
    response = ai_api_router.post_responses(
        {},
        {"model": "gpt-5"},
        preferred_account="Azure",
        stage="R2",
    )
    assert response.status_code == 200
    assert calls == ["SECONDARY", "PRIMARY"]
    assert len(alerts) == 1
    assert alerts[0]["stage"] == "R2"
    assert alerts[0]["failover"] is True


def test_image_router_alerts_on_primary(monkeypatch):
    alerts = []
    calls = []

    class FakeResponse:
        def __init__(self, status_code=200):
            self.status_code = status_code
            self.ok = True
            self.text = ""

    def fake_post(url, headers=None, json=None, timeout=300):
        calls.append(url)
        return FakeResponse(200)

    monkeypatch.setattr(ai_image_router, "get_preferred_account", lambda settings, override=None: "PRIMARY")
    monkeypatch.setattr(ai_image_router, "_primary_key", lambda settings: "pk")
    monkeypatch.setattr(ai_image_router.requests, "post", fake_post)
    monkeypatch.setattr(
        ai_image_router,
        "notify_primary_used",
        lambda **kwargs: alerts.append(kwargs),
    )
    response = ai_image_router.post_image_generation(
        {"openai_secondary_provider": "azure"},
        {"model": "gpt-image-1.5", "prompt": "x"},
        stage="P2",
    )
    assert response.ok
    assert calls and "api.openai.com" in calls[0]
    assert len(alerts) == 1
    assert alerts[0]["stage"] == "P2"
    assert alerts[0]["kind"] == "images"
