"""OpenAI/Azure Responses router with a single automatic failover."""

from __future__ import annotations

import logging
import os
from typing import Any

import requests

from ai_api_preference import account_to_provider, get_preferred_account
from ai_api_status import record_success
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


def post_responses(
    settings: dict[str, Any],
    body: dict[str, Any],
    *,
    timeout: int = 300,
    preferred_account: str | None = None,
) -> requests.Response:
    """Use the preferred provider first, then the other provider once on transient failure."""
    preferred = get_preferred_account(settings, preferred_account)
    failover = "SECONDARY" if preferred == "PRIMARY" else "PRIMARY"

    try:
        response = _post_responses(_settings_for_account(settings, preferred), body, timeout=timeout)
    except (requests.Timeout, requests.ConnectionError) as exc:
        _LOG.warning(
            "AI API %s failed (%s); retrying %s",
            account_to_provider(preferred),
            type(exc).__name__,
            account_to_provider(failover),
        )
        failover_response = _post_responses(_settings_for_account(settings, failover), body, timeout=timeout)
        if failover_response.ok:
            record_success(
                provider=account_to_provider(failover),
                preferred_provider=account_to_provider(preferred),
                failover=True,
                status_code=failover_response.status_code,
            )
        return failover_response

    if response.status_code not in FAILOVER_HTTP_STATUSES:
        if response.ok:
            record_success(
                provider=account_to_provider(preferred),
                preferred_provider=account_to_provider(preferred),
                failover=False,
                status_code=response.status_code,
            )
        return response

    _LOG.warning(
        "AI API %s failed (%s); retrying %s",
        account_to_provider(preferred),
        response.status_code,
        account_to_provider(failover),
    )
    failover_response = _post_responses(_settings_for_account(settings, failover), body, timeout=timeout)
    if failover_response.ok:
        record_success(
            provider=account_to_provider(failover),
            preferred_provider=account_to_provider(preferred),
            failover=True,
            status_code=failover_response.status_code,
        )
    return failover_response
