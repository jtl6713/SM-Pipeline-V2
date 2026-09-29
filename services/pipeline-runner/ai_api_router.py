"""OpenAI/Azure Responses router with a single automatic failover."""

from __future__ import annotations

import logging
import os
from typing import Any

import requests

from ai_api_preference import account_to_provider, cross_provider_failover_enabled, get_preferred_account
from ai_api_status import record_success
from ai_primary_alert import notify_primary_used
from openai_responses import post_responses as _post_responses

FAILOVER_HTTP_STATUSES = {408, 429, 500, 502, 503, 504}
_LOG = logging.getLogger(__name__)


def _settings_for_account(settings: dict[str, Any], account: str) -> dict[str, Any]:
    selected = str(account).strip().upper()
    routed = dict(settings)
    routed["openai_account"] = selected
    key = os.environ.get(f"OPENAI_API_KEY_{selected}", "").strip()
    if not key and selected == "PRIMARY":
        key = os.environ.get("OPENAI_API_KEY", "").strip()
    routed["openai_api_key"] = key
    return routed


def _alert_if_primary(
    account: str,
    *,
    stage: str,
    model: str,
    preferred: str,
    failover: bool,
    status_code: int | None = None,
    error: str | None = None,
) -> None:
    if str(account).strip().upper() != "PRIMARY":
        return
    try:
        notify_primary_used(
            stage=stage or "unknown",
            kind="responses",
            model=model,
            preferred_provider=account_to_provider(preferred),
            failover=failover,
            status_code=status_code,
            error=error,
        )
    except Exception as exc:
        _LOG.warning("PRIMARY usage alert failed: %s", type(exc).__name__)


def post_responses(
    settings: dict[str, Any],
    body: dict[str, Any],
    *,
    timeout: int = 300,
    preferred_account: str | None = None,
    stage: str = "unknown",
) -> requests.Response:
    """Use the preferred provider first, then the other provider once on transient failure."""
    preferred = get_preferred_account(settings, preferred_account)
    failover = "SECONDARY" if preferred == "PRIMARY" else "PRIMARY"
    allow_failover = cross_provider_failover_enabled(settings)
    model = str((body or {}).get("model") or "")

    try:
        response = _post_responses(_settings_for_account(settings, preferred), body, timeout=timeout)
    except (requests.Timeout, requests.ConnectionError) as exc:
        _alert_if_primary(
            preferred,
            stage=stage,
            model=model,
            preferred=preferred,
            failover=False,
            error=type(exc).__name__,
        )
        if not allow_failover:
            _LOG.warning(
                "AI API %s failed (%s); cross-provider failover is disabled",
                account_to_provider(preferred),
                type(exc).__name__,
            )
            raise
        _LOG.warning(
            "AI API %s failed (%s); retrying %s",
            account_to_provider(preferred),
            type(exc).__name__,
            account_to_provider(failover),
        )
        try:
            failover_response = _post_responses(_settings_for_account(settings, failover), body, timeout=timeout)
        except (requests.Timeout, requests.ConnectionError) as failover_exc:
            _alert_if_primary(
                failover,
                stage=stage,
                model=model,
                preferred=preferred,
                failover=True,
                error=type(failover_exc).__name__,
            )
            raise
        _alert_if_primary(
            failover,
            stage=stage,
            model=model,
            preferred=preferred,
            failover=True,
            status_code=failover_response.status_code,
        )
        if failover_response.ok:
            record_success(
                provider=account_to_provider(failover),
                preferred_provider=account_to_provider(preferred),
                failover=True,
                status_code=failover_response.status_code,
            )
        return failover_response

    _alert_if_primary(
        preferred,
        stage=stage,
        model=model,
        preferred=preferred,
        failover=False,
        status_code=response.status_code,
    )

    if response.status_code not in FAILOVER_HTTP_STATUSES:
        if response.ok:
            record_success(
                provider=account_to_provider(preferred),
                preferred_provider=account_to_provider(preferred),
                failover=False,
                status_code=response.status_code,
            )
        return response

    if not allow_failover:
        _LOG.warning(
            "AI API %s failed (%s); cross-provider failover is disabled",
            account_to_provider(preferred),
            response.status_code,
        )
        return response

    _LOG.warning(
        "AI API %s failed (%s); retrying %s",
        account_to_provider(preferred),
        response.status_code,
        account_to_provider(failover),
    )
    try:
        failover_response = _post_responses(_settings_for_account(settings, failover), body, timeout=timeout)
    except (requests.Timeout, requests.ConnectionError) as failover_exc:
        _alert_if_primary(
            failover,
            stage=stage,
            model=model,
            preferred=preferred,
            failover=True,
            error=type(failover_exc).__name__,
        )
        raise
    _alert_if_primary(
        failover,
        stage=stage,
        model=model,
        preferred=preferred,
        failover=True,
        status_code=failover_response.status_code,
    )
    if failover_response.ok:
        record_success(
            provider=account_to_provider(failover),
            preferred_provider=account_to_provider(preferred),
            failover=True,
            status_code=failover_response.status_code,
        )
    return failover_response
