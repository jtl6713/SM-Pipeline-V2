from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from branding.watermark import already_branded_url
from lettering.constants import LEFTOVER_OVERLAY_TEXTS, MAX_OVERLAY_CHARS

_FONT_CANDIDATES = (
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
    Path(r"C:\Windows\Fonts\segoeuib.ttf"),
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
)


def is_leftover_overlay_text(text: str) -> bool:
    return str(text or "").strip().lower() in LEFTOVER_OVERLAY_TEXTS


def overlay_text_for_clip(clip: dict, fallback_title: str = "") -> str:
    overlay = clip.get("overlay") or {}
    if isinstance(overlay, str):
        text = overlay.strip()
    else:
        text = str(overlay.get("text") or "").strip()
    caption = str(clip.get("caption") or "").strip()
    text = text or caption
    if is_leftover_overlay_text(text):
        text = ""
    title = str(fallback_title or "").strip()
    if is_leftover_overlay_text(title):
        title = ""
    if len(text) > MAX_OVERLAY_CHARS:
        text = title or text[:MAX_OVERLAY_CHARS].rstrip()
    return (text or title).strip()


def is_ai_cover_clip(clip: dict) -> bool:
    source = str(clip.get("source") or "").lower()
    name = str(clip.get("asset_name") or clip.get("assetName") or clip.get("id") or "").lower()
    return (
        "ai_grid_cover" in source
        or "ai-grid-cover" in name
        or source in {"studio_ai_grid_cover", "studio_ai_cover"}
        or str(clip.get("id") or "") == "studio-ai-cover"
    )


def already_lettered_url(url: str) -> bool:
    return already_branded_url(url)


def _font(size: int) -> ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
        if len(lines) == 3:
            break
    if current and len(lines) < 3:
        lines.append(current)
    return lines[:3]


def letter_jpeg_bytes(image_bytes: bytes, text: str) -> bytes:
    overlay = str(text or "").strip()
    if not overlay:
        return image_bytes
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    band_h = max(int(height * 0.18), 96)
    font_size = max(int(width * 0.045), 28)
    font = _font(font_size)
    overlay_img = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_img)
    draw.rectangle((0, height - band_h, width, height), fill=(0, 0, 0, 150))
    max_text_width = width - int(width * 0.08)
    lines = _wrap(draw, overlay, font, max_text_width)
    line_h = font_size + 8
    block_h = line_h * len(lines)
    y = height - band_h + max(int((band_h - block_h) / 2), 12)
    for line in lines:
        line_w = draw.textlength(line, font=font)
        x = max(int((width - line_w) / 2), 16)
        draw.text((x, y), line, font=font, fill=(255, 255, 255, 255))
        y += line_h
    composed = Image.alpha_composite(image.convert("RGBA"), overlay_img).convert("RGB")
    out = BytesIO()
    composed.save(out, format="JPEG", quality=90, optimize=True)
    return out.getvalue()
