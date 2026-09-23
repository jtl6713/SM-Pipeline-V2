"""Finished-cover prompt only — no network or Airtable imports."""

from __future__ import annotations

from typing import Any

# Photorealistic scene; restrained gold lettering (~80%); colorful 3D only as occasional variety.
THUMBNAIL_LETTER_STYLE_RULE = (
    "Photorealism: the scene must look like a real photograph (natural camera, real light, "
    "real textures). Do not make it illustrated, CGI, painterly, plastic, or luxury-ad composite. "
    "Lettering mix: for at least ~80% of covers use restrained gold or black-and-gold block "
    "lettering — soft brushed or matte gold, or black letters with a thin gold edge. Quiet and "
    "sophisticated; keep lettering secondary to the photo. Do not use chrome, mirror-foil, glow, "
    "sparkle, giant arched 3D slabs, or gold-on-everything. Use colorful glossy 3D block lettering "
    "for at most ~20% of covers, and only when the subject clearly calls for high-energy playful "
    "treatment. Do not default to bright multicolor candy 3D letters."
)

# Back-compat alias for older imports/tests.
COLORFUL_3D_RULE = THUMBNAIL_LETTER_STYLE_RULE


def _text(record: dict[str, Any] | None, name: str) -> str:
    if not record:
        return ""
    fields = record.get("fields") if isinstance(record.get("fields"), dict) else record
    return str((fields or {}).get(name) or "").strip()


def _prompt_has_letter_style(existing: str) -> bool:
    lower = existing.lower()
    return (
        "gold" in lower
        or "black-and-gold" in lower
        or "colorful 3d" in lower
        or "block letter" in lower
    )


def build_finished_thumbnail_prompt(
    request: dict[str, Any],
    parent: dict[str, Any] | None,
    *,
    aspect_ratio: str = "9:16",
) -> str:
    existing = _text(parent, "Thumbnail_Prompt")
    ratio = str(aspect_ratio or "9:16").replace("x", ":").strip() or "9:16"
    # Old landscape-leaning prompts must not be reused for vertical platform covers.
    if existing and _prompt_has_letter_style(existing) and f"{ratio}" in existing and "FRAME:" in existing:
        return existing
    title = (
        _text(request, "Requested_Title")
        or _text(parent, "Content_Title")
        or _text(parent, "Hook")
        or "Chicago"
    )
    caption = (
        _text(request, "Requested_Caption")
        or _text(parent, "Caption")
        or _text(parent, "Idea_Summary")
    )
    orientation = "portrait vertical" if ratio in {"9:16", "4:5"} else ("square" if ratio == "1:1" else "landscape horizontal")
    return "\n".join(
        part
        for part in (
            f"Create a ChicagoShining social thumbnail / promo still for: {title}.",
            f"Post context: {caption[:500]}" if caption else "",
            THUMBNAIL_LETTER_STYLE_RULE,
            f"Compose for a {orientation} {ratio} platform cover that matches the video frame.",
            "Text must be large and readable on a phone, near the center or slightly below center, inside safe margins, and not in the top or bottom 10%. Do not let lettering dominate the frame.",
            "Photorealistic and readable. Do not invent logos, watermarks, platform UI, or distorted letters.",
        )
        if part
    )
