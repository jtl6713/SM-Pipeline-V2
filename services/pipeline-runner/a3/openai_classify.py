"""A3 OpenAI classification call — Make 5569035 gpt-5.5 json_object."""

from __future__ import annotations

import json
import re
from typing import Any

from a3.constants import OPENAI_MODEL
from config import load_settings
from ai_api_router import post_responses


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI A3 response was not a JSON object")
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
    raise RuntimeError("OpenAI A3 response had no output text")


def classify_asset(prompt: str, *, image_urls: list[str] | None = None, max_output_tokens: int = 4000) -> dict[str, Any]:
    settings = load_settings()
    model = str(settings.get("openai_a3_model") or OPENAI_MODEL)
    content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
    for url in (image_urls or [])[:8]:
        if url:
            content.append({"type": "input_image", "image_url": url})
    response = post_responses(
        settings,
        {
            "model": model,
            "input": [{"role": "user", "content": content}],
            "store": False,
            "reasoning": {"effort": "low"},
            "max_output_tokens": max_output_tokens,
            "text": {"format": {"type": "json_object"}},
        },
        timeout=300,
        stage="A3",
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI A3 classification failed ({response.status_code}): {detail}")
    raw = _output_text(response.json())
    return {"raw_text": raw, "parsed": _extract_json(raw)}
