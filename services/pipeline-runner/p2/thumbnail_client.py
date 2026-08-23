"""OpenAI thumbnail generation — Make module 8 port."""

from __future__ import annotations

import base64

import requests

from config import load_settings
from p2.constants import OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, THUMBNAIL_PROMPT_SUFFIX


def build_thumbnail_prompt(thumbnail_prompt: str) -> str:
    base = thumbnail_prompt.strip()
    if not base:
        raise ValueError("Thumbnail_Prompt is required")
    return f"{base}{THUMBNAIL_PROMPT_SUFFIX}"


def generate_thumbnail_png(thumbnail_prompt: str) -> bytes:
    settings = load_settings()
    api_key = str(settings.get("openai_api_key") or "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for P2 thumbnail generation")
    response = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_IMAGE_MODEL,
            "prompt": build_thumbnail_prompt(thumbnail_prompt),
            "n": 1,
            "size": "auto",
            "quality": OPENAI_IMAGE_QUALITY,
            "background": "auto",
            "moderation": "auto",
            "output_format": "png",
        },
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") or []
    if not data:
        raise RuntimeError("OpenAI image generation returned no data")
    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url = str(item.get("url") or "").strip()
    if not url:
        raise RuntimeError("OpenAI image generation returned neither b64_json nor url")
    image_response = requests.get(url, timeout=300)
    image_response.raise_for_status()
    return image_response.content
