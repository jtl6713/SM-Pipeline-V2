"""OpenAI gpt-image-1.5 generation used by C2 and C5."""

from __future__ import annotations

import base64

import requests

from carousel.constants import IMAGE_PROMPT_SUFFIX, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, REPLACEMENT_PROMPT_SUFFIX
from carousel.mapping import image_size_for_ratio
from config import load_settings


def build_c2_prompt(prompt: str, *, platform: str, ratio: str) -> str:
    base = str(prompt or "").strip()
    if not base:
        raise ValueError("AI Prompt is required")
    return f"{base}{IMAGE_PROMPT_SUFFIX.format(platform=platform, ratio=ratio)}"


def build_c5_prompt(
    *,
    replacement_prompt: str,
    review_notes: str,
    original_prompt: str,
    platform: str,
    ratio: str,
) -> str:
    lead = (replacement_prompt or review_notes or original_prompt or "").strip()
    if not lead:
        raise ValueError("Replacement Prompt, Review Notes, or AI Prompt is required")
    return (
        f"{lead}{REPLACEMENT_PROMPT_SUFFIX.format(notes=review_notes or '', original=original_prompt or '', platform=platform, ratio=ratio)}"
    )


def generate_carousel_png(prompt: str, *, ratio: str) -> bytes:
    settings = load_settings()
    api_key = str(settings.get("openai_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for carousel image generation")
    size = image_size_for_ratio(ratio)
    response = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_IMAGE_MODEL,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "quality": OPENAI_IMAGE_QUALITY,
            "background": "auto",
            "moderation": "auto",
            "output_format": "png",
        },
        timeout=300,
    )
    if not response.ok:
        detail = (response.text or "").strip()[:400]
        raise RuntimeError(f"OpenAI carousel image generation failed ({response.status_code}): {detail}")
    payload = response.json()
    data = payload.get("data") or []
    if not data:
        raise RuntimeError("OpenAI carousel image generation returned no data")
    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = str(item.get("url") or "").strip()
    if not url:
        raise RuntimeError("OpenAI carousel image generation returned neither b64_json nor url")
    image_response = requests.get(url, timeout=300)
    image_response.raise_for_status()
    return image_response.content
