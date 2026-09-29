"""P1 OpenAI Responses call — Make 5528742 module 11 (gpt-5)."""

from __future__ import annotations

import json
import re
from typing import Any

from config import load_settings
from ai_api_router import post_responses
from p1.constants import DEFAULT_MAX_OUTPUT_TOKENS, OPENAI_MODEL
from render.fields import field, field_str


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("OpenAI P1 response was not a JSON object")
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
    raise RuntimeError("OpenAI P1 response had no output text")


def generate_package(prompt_row: dict[str, Any], runtime_context: str) -> dict[str, Any]:
    settings = load_settings()
    model = field_str(prompt_row, "Model") or str(settings.get("openai_p1_model") or OPENAI_MODEL)
    max_tokens = field(prompt_row, "Max Output Tokens") or DEFAULT_MAX_OUTPUT_TOKENS
    try:
        max_tokens = int(max_tokens)
    except (TypeError, ValueError):
        max_tokens = DEFAULT_MAX_OUTPUT_TOKENS
    user = (
        f"{field_str(prompt_row, 'User Prompt Template')}\n\n"
        f"{runtime_context}\n\n"
        f"REQUIRED OUTPUT STRUCTURE\n{field_str(prompt_row, 'JSON Schema')}"
    )
    response = post_responses(
        settings,
        {
            "model": model,
            "instructions": field_str(prompt_row, "System Prompt"),
            "input": user,
            "store": False,
            "max_output_tokens": max_tokens,
            "reasoning": {"effort": "low"},
            "text": {"format": {"type": "json_object"}},
        },
        timeout=300,
        stage="P1",
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI P1 generation failed ({response.status_code}): {detail}")
    raw = _output_text(response.json())
    return {"raw_text": raw, "parsed": _extract_json(raw)}
