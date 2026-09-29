"""Image generation router honoring the runtime OpenAI/Azure preference.

Azure Preferred must never silently charge PRIMARY because an Azure image
deployment is missing. Missing Azure image configuration is treated as a
configuration error; transient provider failures can fail over once when the
alternate image provider is actually configured.
"""

from __future__ import annotations

import logging
import os
from urllib.parse import urlencode
from typing import Any

import requests

from ai_api_preference import account_to_provider, cross_provider_failover_enabled, get_preferred_account
from ai_api_status import record_success
from ai_primary_alert import notify_primary_used

FAILOVER_HTTP_STATUSES = {408, 429, 500, 502, 503, 504}
PRIMARY_IMAGES_URL = "https://api.openai.com/v1/images/generations"
_LOG = logging.getLogger(__name__)


def _primary_key(settings: dict[str, Any]) -> str:
    return (
        os.environ.get("OPENAI_API_KEY_PRIMARY", "").strip()
        or str(settings.get("openai_api_key_primary") or "").strip()
        or os.environ.get("OPENAI_API_KEY", "").strip()
    )


def _secondary_key(settings: dict[str, Any]) -> str:
    return (
        os.environ.get("OPENAI_API_KEY_SECONDARY", "").strip()
        or str(settings.get("openai_api_key_secondary") or "").strip()
    )


def _azure_target(settings: dict[str, Any]) -> tuple[str, dict[str, str], str]:
    endpoint = str(settings.get("openai_secondary_endpoint") or "").strip().rstrip("/")
    api_version = str(settings.get("openai_secondary_image_api_version") or "preview").strip()
    deployment = str(settings.get("openai_secondary_image_deployment") or "").strip()
    key = _secondary_key(settings)
    if not endpoint or not deployment or not key:
        raise RuntimeError(
            "Azure is Preferred for AI images but OPENAI_SECONDARY_IMAGE_DEPLOYMENT "
            "(plus endpoint/key) is not configured. Refusing to fall through to "
            "PRIMARY OpenAI and create an unexpected charge."
        )
    query = urlencode({"api-version": api_version})
    return (
        f"{endpoint}/openai/v1/images/generations?{query}",
        {"api-key": key, "Content-Type": "application/json"},
        deployment,
    )


def _target(settings: dict[str, Any], account: str, requested_model: str) -> tuple[str, dict[str, str], str]:
    selected = str(account or "").strip().upper()
    if selected == "SECONDARY":
        if str(settings.get("openai_secondary_provider") or "").strip().lower() != "azure":
            raise RuntimeError("SECONDARY image provider is not configured as Azure")
        return _azure_target(settings)
    key = _primary_key(settings)
    if not key:
        raise RuntimeError("PRIMARY OpenAI image key is not configured")
    return (
        PRIMARY_IMAGES_URL,
        {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        requested_model,
    )


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
            kind="images",
            model=model,
            preferred_provider=account_to_provider(preferred),
            failover=failover,
            status_code=status_code,
            error=error,
        )
    except Exception as exc:
        _LOG.warning("PRIMARY image usage alert failed: %s", type(exc).__name__)


def post_image_generation(
    settings: dict[str, Any],
    body: dict[str, Any],
    *,
    timeout: int = 300,
    preferred_account: str | None = None,
    stage: str = "unknown",
) -> requests.Response:
    preferred = get_preferred_account(settings, preferred_account)
    alternate = "SECONDARY" if preferred == "PRIMARY" else "PRIMARY"
    allow_failover = cross_provider_failover_enabled(settings)
    requested_model = str(body.get("model") or "")

    def call(account: str) -> requests.Response:
        url, headers, model = _target(settings, account, requested_model)
        payload = dict(body)
        payload["model"] = model
        return requests.post(url, headers=headers, json=payload, timeout=timeout)

    try:
        response = call(preferred)
    except (requests.Timeout, requests.ConnectionError) as exc:
        _alert_if_primary(
            preferred,
            stage=stage,
            model=requested_model,
            preferred=preferred,
            failover=False,
            error=type(exc).__name__,
        )
        response = None
    except RuntimeError as exc:
        # A preferred-provider configuration gap is an availability failure.
        # If cross-provider failover is explicitly enabled, use the alternate
        # configured provider instead of blocking the entire production job.
        # When failover is disabled, preserve the hard stop.
        if not allow_failover:
            raise
        _LOG.warning(
            "Preferred image provider unavailable due to configuration: %s; failing over to %s",
            str(exc),
            alternate,
        )
        response = None

    if response is not None:
        _alert_if_primary(
            preferred,
            stage=stage,
            model=requested_model,
            preferred=preferred,
            failover=False,
            status_code=response.status_code,
        )

    if response is not None and response.status_code not in FAILOVER_HTTP_STATUSES:
        if response.ok:
            record_success(
                provider=account_to_provider(preferred),
                preferred_provider=account_to_provider(preferred),
                failover=False,
                status_code=response.status_code,
            )
        return response

    # Cross-provider spend is opt-in. With Azure Preferred, a transient Azure
    # failure must not silently become a PRIMARY OpenAI charge.
    if not allow_failover:
        if response is None:
            raise requests.ConnectionError(
                f"{account_to_provider(preferred)} image provider failed and cross-provider failover is disabled"
            )
        return response

    # Only transient runtime failures can use the alternate provider.
    try:
        failover_response = call(alternate)
    except (requests.Timeout, requests.ConnectionError) as failover_exc:
        _alert_if_primary(
            alternate,
            stage=stage,
            model=requested_model,
            preferred=preferred,
            failover=True,
            error=type(failover_exc).__name__,
        )
        raise
    _alert_if_primary(
        alternate,
        stage=stage,
        model=requested_model,
        preferred=preferred,
        failover=True,
        status_code=failover_response.status_code,
    )
    if failover_response.ok:
        record_success(
            provider=account_to_provider(alternate),
            preferred_provider=account_to_provider(preferred),
            failover=True,
            status_code=failover_response.status_code,
        )
    return failover_response
