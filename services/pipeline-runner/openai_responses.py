"""Route OpenAI Responses calls to PRIMARY or Azure SECONDARY, with one failover."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import requests

PRIMARY_RESPONSES_URL = "https://api.openai.com/v1/responses"
# Transient provider failures. A 4xx request error stays with the caller.
QUALIFYING_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})


def _account_name(value: str | None, *, default: str) -> str:
    account = str(value or default).strip().upper()
    if account not in {"PRIMARY", "SECONDARY"}:
        raise RuntimeError("OpenAI account must be PRIMARY or SECONDARY")
    return account


def _key_for(settings: dict[str, Any], account: str) -> str:
    specific = str(settings.get(f"openai_api_key_{account.lower()}") or "").strip()
    if specific:
        return specific
    active = _account_name(settings.get("openai_account"), default="PRIMARY")
    if account == active:
        return str(settings.get("openai_api_key") or "").strip()
    return ""


def responses_target(
    settings: dict[str, Any],
    stage_model: str,
    account: str | None = None,
) -> tuple[str, dict[str, str], str]:
    """Return (url, headers, model) for one account. Does not read or write the process environment."""
    selected = _account_name(account, default=str(settings.get("openai_account") or "PRIMARY"))
    api_key = _key_for(settings, selected)
    provider = str(settings.get("openai_secondary_provider") or "").strip().lower()
    if selected == "SECONDARY" and provider == "azure":
        endpoint = str(settings.get("openai_secondary_endpoint") or "").strip().rstrip("/")
        api_version = str(settings.get("openai_secondary_api_version") or "").strip()
        deployment = str(settings.get("openai_secondary_deployment") or "").strip()
        if not endpoint or not api_version or not deployment:
            raise RuntimeError(
                "OPENAI_SECONDARY_ENDPOINT, OPENAI_SECONDARY_API_VERSION, "
                "and OPENAI_SECONDARY_DEPLOYMENT are required when "
                "OPENAI_SECONDARY_PROVIDER=azure"
            )
        query = urlencode({"api-version": api_version})
        url = f"{endpoint}/openai/responses?{query}"
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json",
        }
        return url, headers, deployment
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    return PRIMARY_RESPONSES_URL, headers, stage_model


def _qualifying_failure(response: requests.Response) -> bool:
    return response.status_code in QUALIFYING_STATUS_CODES


def post_responses(
    settings: dict[str, Any],
    body: dict[str, Any],
    *,
    timeout: int = 300,
    preferred_account: str | None = None,
) -> requests.Response:
    """POST a Responses payload.

    preferred_account overrides only this call. PRIMARY fails over to SECONDARY,
    and SECONDARY fails over to PRIMARY, after a qualifying transport or status failure.
    """
    stage_model = str(body.get("model") or "")
    preferred = _account_name(
        preferred_account,
        default=str(settings.get("openai_account") or "PRIMARY"),
    )
    fallback = "SECONDARY" if preferred == "PRIMARY" else "PRIMARY"
    last_response: requests.Response | None = None
    last_error: Exception | None = None
    for index, account in enumerate((preferred, fallback)):
        if not _key_for(settings, account):
            continue
        try:
            url, headers, model = responses_target(settings, stage_model, account)
        except RuntimeError as error:
            last_error = error
            continue
        payload = dict(body)
        payload["model"] = model
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=timeout)
        except requests.RequestException as error:
            last_error = error
            continue
        if response.ok or not _qualifying_failure(response) or index == 1:
            return response
        last_response = response
    if last_response is not None:
        return last_response
    if last_error is not None:
        raise last_error
    raise RuntimeError("OpenAI Responses request had no configured account key")
