"""Route OpenAI Responses calls to PRIMARY or Azure SECONDARY."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import requests

PRIMARY_RESPONSES_URL = "https://api.openai.com/v1/responses"


def responses_target(settings: dict[str, Any], stage_model: str) -> tuple[str, dict[str, str], str]:
    """Return (url, headers, model) for the active OpenAI account."""
    account = str(settings.get("openai_account") or "PRIMARY").strip().upper()
    api_key = str(settings.get("openai_api_key") or "").strip()
    provider = str(settings.get("openai_secondary_provider") or "").strip().lower()
    if account == "SECONDARY" and provider == "azure":
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


def post_responses(settings: dict[str, Any], body: dict[str, Any], *, timeout: int = 300) -> requests.Response:
    """POST a Responses payload. Azure replaces the model with the deployment name."""
    stage_model = str(body.get("model") or "")
    url, headers, model = responses_target(settings, stage_model)
    payload = dict(body)
    payload["model"] = model
    return requests.post(url, headers=headers, json=payload, timeout=timeout)
