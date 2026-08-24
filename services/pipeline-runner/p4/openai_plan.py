"""OpenAI coverage plan — Make 5533802 module 7/8."""

from __future__ import annotations

import json
import re
from typing import Any

import requests

from config import load_settings
from p4.constants import OPENAI_MAX_TOKENS, OPENAI_MODEL


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI response was not a JSON object")
    return parsed


def plan_asset_request(messages: list[dict[str, str]]) -> dict[str, Any]:
    settings = load_settings()
    api_key = settings.get("openai_api_key", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for P4 asset-need planning")
    model = str(settings.get("openai_p4_model") or OPENAI_MODEL)
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "max_tokens": OPENAI_MAX_TOKENS,
        },
        timeout=300,
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI P4 planning failed ({response.status_code}): {detail}")
    content = response.json()["choices"][0]["message"]["content"]
    return {"raw_text": content, "parsed": _extract_json(content)}
