"""ITS1 OpenAI Responses call."""

from __future__ import annotations

import json
import re
from typing import Any

from ai_api_router import post_responses
from config import load_settings
from its1.constants import OPENAI_MODEL


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI ITS1 response was not a JSON object")
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
    raise RuntimeError("OpenAI ITS1 response had no output text")


def generate_timed_script(prompt: str) -> dict[str, Any]:
    settings = load_settings()
    model = str(settings.get("openai_sai1_model") or OPENAI_MODEL)
    response = post_responses(
        settings,
        {
            "model": model,
            "input": prompt,
            "store": False,
            "reasoning": {"effort": "low"},
            "text": {"format": {"type": "json_object"}},
        },
        timeout=180,
        stage="ITS1",
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI ITS1 timed script failed ({response.status_code}): {detail}")
    raw = _output_text(response.json())
    return {"raw_text": raw, "parsed": _extract_json(raw)}
