"""R2 canonical selection routed through the runtime OpenAI/Azure preference."""

from __future__ import annotations

import json
import re
from typing import Any

from ai_api_router import post_responses
from config import load_settings
from r2.constants import MAKE_SCENARIO_ID
from r2.prompt_builder import build_prompt


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
    raise RuntimeError("R2 AI response had no output text")


def _call_openai(prompt: str) -> tuple[str, dict[str, Any]]:
    settings = load_settings()
    model = str(settings.get("openai_r2_model") or "gpt-4.1")
    response = post_responses(
        settings,
        {
            "model": model,
            "input": prompt,
            "store": False,
            "max_output_tokens": 4000,
            "text": {"format": {"type": "json_object"}},
        },
        timeout=300,
        stage="R2",
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"R2 AI selection failed ({response.status_code}): {detail}")
    content = _output_text(response.json())
    return content, _extract_json(content)


def select_canonical_package(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    video_candidates: list[dict[str, Any]],
    music_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = build_prompt(
        output=output,
        content_item=content_item,
        video_candidates=video_candidates,
        music_candidates=music_candidates,
    )
    raw_text, parsed = _call_openai(prompt)
    return {
        "raw_text": raw_text,
        "parsed": parsed,
        "make_scenario_id": MAKE_SCENARIO_ID,
        "selection_status": parsed.get("selection_status"),
    }
