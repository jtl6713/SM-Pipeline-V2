"""I1 OpenAI Responses call — Make 5514334 module 13 (gpt-5)."""

from __future__ import annotations

import json
import re
from typing import Any

import requests

from config import load_settings
from i1.constants import OPENAI_MODEL


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI I1 response was not a JSON object")
    return parsed


def _output_text(payload: dict[str, Any]) -> str:
    direct = str(payload.get("output_text") or "").strip()
    if direct:
        return direct
    chunks: list[str] = []
    for item in payload.get("output") or []:
        if not isinstance(item, dict):
            continue
        for part in item.get("content") or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text") or part.get("output_text")
            if text:
                chunks.append(str(text))
    if chunks:
        return "\n".join(chunks).strip()
    raise RuntimeError("OpenAI I1 response had no output text")


def generate_ideas(prompt: str) -> dict[str, Any]:
    settings = load_settings()
    api_key = str(settings.get("openai_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for I1 idea generation")
    model = str(settings.get("openai_i1_model") or settings.get("openai_sai1_model") or OPENAI_MODEL)
    response = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": prompt,
            "store": False,
            "reasoning": {"effort": "low"},
            "text": {"format": {"type": "json_object"}},
        },
        timeout=300,
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI I1 generation failed ({response.status_code}): {detail}")
    raw = _output_text(response.json())
    return {"raw_text": raw, "parsed": _extract_json(raw)}
