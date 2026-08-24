"""OpenAI canonical selection — Make module 7/8 port."""

from __future__ import annotations

import json
import re
from typing import Any

import requests

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
        raise ValueError("OpenAI response was not a JSON object")
    return parsed


def _call_openai(prompt: str) -> tuple[str, dict[str, Any]]:
    settings = load_settings()
    api_key = settings.get("openai_api_key", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for R2 asset selection")
    model = settings.get("openai_r2_model", "gpt-4.1")
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "max_tokens": 14000,
        },
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
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
