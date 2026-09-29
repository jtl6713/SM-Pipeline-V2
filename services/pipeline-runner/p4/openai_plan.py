"""P4 AI coverage planning routed through the runtime OpenAI/Azure preference."""

from __future__ import annotations

import json
import re
from typing import Any

from ai_api_router import post_responses
from config import load_settings
from p4.constants import OPENAI_MAX_TOKENS, OPENAI_MODEL


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("AI response was not a JSON object")
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
            value = part.get("text") or part.get("output_text")
            if value:
                chunks.append(str(value))
    if chunks:
        return "\n".join(chunks).strip()
    raise RuntimeError("P4 AI response had no output text")


def _responses_input(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    routed: list[dict[str, str]] = []
    for message in messages or []:
        role = str(message.get("role") or "user").strip().lower()
        if role == "system":
            role = "developer"
        if role not in {"developer", "user", "assistant"}:
            role = "user"
        routed.append({"role": role, "content": str(message.get("content") or "")})
    return routed


def plan_asset_request(messages: list[dict[str, str]]) -> dict[str, Any]:
    settings = load_settings()
    model = str(settings.get("openai_p4_model") or OPENAI_MODEL)
    response = post_responses(
        settings,
        {
            "model": model,
            "input": _responses_input(messages),
            "store": False,
            "max_output_tokens": OPENAI_MAX_TOKENS,
            "text": {"format": {"type": "json_object"}},
        },
        timeout=300,
        stage="P4",
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"P4 AI planning failed ({response.status_code}): {detail}")
    content = _output_text(response.json())
    return {"raw_text": content, "parsed": _extract_json(content)}
