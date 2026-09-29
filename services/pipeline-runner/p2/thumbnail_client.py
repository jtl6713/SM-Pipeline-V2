"""Provider-routed thumbnail generation — Make module 8 port.

Must honor Studio AI_API_PREFERRED_PROVIDER (Azure Preferred = SECONDARY).
Hardcoding api.openai.com charged PRIMARY even when Preferred was Azure.
"""

from __future__ import annotations

import base64
import io
from typing import Any

import requests
from PIL import Image

from ai_image_router import post_image_generation
from config import load_settings
from p2.constants import OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY, THUMBNAIL_PROMPT_SUFFIX


# gpt-image-1.5 supported sizes. Portrait is 2:3; we crop to exact platform canvas after.
_OPENAI_SIZE_BY_RATIO = {
    "16:9": "1536x1024",
    "1:1": "1024x1024",
    "4:5": "1024x1536",
    "9:16": "1024x1536",
}

_CANVAS_BY_RATIO = {
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "9:16": (1080, 1920),
}


def image_size_for_ratio(ratio: str) -> str:
    value = str(ratio or "").replace("x", ":").strip()
    return _OPENAI_SIZE_BY_RATIO.get(value, "1024x1536")


def canvas_for_ratio(ratio: str) -> tuple[int, int]:
    value = str(ratio or "").replace("x", ":").strip()
    return _CANVAS_BY_RATIO.get(value, (1080, 1920))


def build_thumbnail_prompt(thumbnail_prompt: str, *, aspect_ratio: str = "9:16") -> str:
    base = thumbnail_prompt.strip()
    if not base:
        raise ValueError("Thumbnail_Prompt is required")
    ratio = str(aspect_ratio or "9:16").replace("x", ":").strip() or "9:16"
    width, height = canvas_for_ratio(ratio)
    orientation = "portrait / vertical" if height > width else ("landscape / horizontal" if width > height else "square")
    frame_line = (
        f"\nFRAME: Exact {orientation} {ratio} social cover ({width}x{height}). "
        "Fill the full frame edge-to-edge. Do not compose as a landscape banner."
    )
    return f"{base}{frame_line}{THUMBNAIL_PROMPT_SUFFIX}"


def fit_png_to_ratio(png_bytes: bytes, aspect_ratio: str = "9:16") -> bytes:
    """Center-crop / cover-scale PNG to the platform canvas (e.g. 1080x1920 for 9:16)."""
    target_w, target_h = canvas_for_ratio(aspect_ratio)
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    src_w, src_h = image.size
    if src_w <= 0 or src_h <= 0:
        return png_bytes
    scale = max(target_w / src_w, target_h / src_h)
    resized = image.resize((max(1, round(src_w * scale)), max(1, round(src_h * scale))), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - target_w) // 2)
    top = max(0, (resized.height - target_h) // 2)
    cropped = resized.crop((left, top, left + target_w, top + target_h))
    out = io.BytesIO()
    cropped.save(out, format="PNG")
    return out.getvalue()


def generate_thumbnail_png(thumbnail_prompt: str, *, aspect_ratio: str = "9:16") -> bytes:
    settings = load_settings()
    size = image_size_for_ratio(aspect_ratio)
    response = post_image_generation(
        settings,
        {
            "model": OPENAI_IMAGE_MODEL,
            "prompt": build_thumbnail_prompt(thumbnail_prompt, aspect_ratio=aspect_ratio),
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
        raise RuntimeError(f"AI image generation failed ({response.status_code}): {detail}")
    payload = response.json()
    data = payload.get("data") or []
    if not data:
        raise RuntimeError("AI image generation returned no data")
    item = data[0]
    b64 = item.get("b64_json")
    if b64:
        raw = base64.b64decode(b64)
    else:
        url = str(item.get("url") or "").strip()
        if not url:
            raise RuntimeError("AI image generation returned neither b64_json nor url")
        image_response = requests.get(url, timeout=300)
        image_response.raise_for_status()
        raw = image_response.content
    return fit_png_to_ratio(raw, aspect_ratio)
