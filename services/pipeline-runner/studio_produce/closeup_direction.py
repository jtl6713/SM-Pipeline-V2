"""Issue #2876: optional focal-detail direction for NEW AI-created stills only.

This file never selects existing library media, changes a crop, regenerates an
approved image, or bypasses human review. The ~1/3 target is an editorial
preference, not permission to overwrite or a publication quota.
"""

from __future__ import annotations

import hashlib
import math
import os

DEFAULT_EXTREME_CLOSEUP_SHARE = 1.0 / 3.0
CLOSEUP_SHARE_ENV = "STUDIO_EXTREME_CLOSEUP_SHARE"

_CITY_EXAMPLES = {
    "chicago": (
        "Wrigley Building clock face; a verified gold dome or architectural ornament; "
        "ice-skate boot and blade at a real rink; bridge-rivet or sculpture detail"
    ),
    "new york": (
        "Grand Central's clock; verified Chrysler Building ornament; "
        "subway mosaics; Brooklyn Bridge cable details"
    ),
    "los angeles": (
        "Griffith Observatory dome detail; Bradbury Building ironwork; "
        "Watts Towers tilework; an identifiable local theater marquee"
    ),
    "miami": (
        "Ocean Drive Art Deco neon or facade detail; Vizcaya stonework; "
        "Wynwood mural texture; a recognizable local tropical detail"
    ),
}


def extreme_closeup_share(raw: str | None = None) -> float:
    """Target proportion for NEW AI images; 0 opts out, invalid uses 1/3."""
    value = os.environ.get(CLOSEUP_SHARE_ENV, "") if raw is None else raw
    if str(value or "").strip() == "":
        return DEFAULT_EXTREME_CLOSEUP_SHARE
    try:
        share = float(str(value).strip())
    except (TypeError, ValueError):
        return DEFAULT_EXTREME_CLOSEUP_SHARE
    return share if math.isfinite(share) and 0 <= share <= 1 else DEFAULT_EXTREME_CLOSEUP_SHARE


def _stable_eligible(creation_key: str, share: float) -> bool:
    """Consistent 1-in-3 sampling for independently generated single images."""
    if not creation_key:
        return False  # no stable new-image identity: do not force an image change
    digest = hashlib.sha256(str(creation_key).encode("utf-8")).digest()
    fraction = int.from_bytes(digest[:8], "big") / 2**64
    return fraction < share


def closeup_target(count: int, share: float | None = None, *, creation_key: str = "") -> int:
    """Approximate new AI-image prompt quota, not an exact output guarantee."""
    total = max(0, int(count))
    fraction = extreme_closeup_share() if share is None else share
    if not math.isfinite(fraction) or not 0 <= fraction <= 1:
        fraction = DEFAULT_EXTREME_CLOSEUP_SHARE
    if total == 1:
        return int(_stable_eligible(creation_key, fraction))
    return min(total, math.floor(total * fraction + 0.5))


def market_closeup_examples(market: str) -> str:
    name = str(market or "").lower().strip()
    if "chicago" in name:
        return _CITY_EXAMPLES["chicago"]
    if name in ("nyc", "new york city") or "new york" in name:
        return _CITY_EXAMPLES["new york"]
    if name == "la" or "los angeles" in name:
        return _CITY_EXAMPLES["los angeles"]
    if "miami" in name:
        return _CITY_EXAMPLES["miami"]
    return "verified architectural details, meaningful objects, signs, textures and local activities"


def ai_slide_closeup_guidance(*, market: str, requested_count: int, creation_key: str = "") -> str:
    """Add focal-detail ideas ONLY to prompts for new AI-generated slide images."""
    share = extreme_closeup_share()
    if not share or requested_count <= 0:
        return ""
    target = closeup_target(requested_count, share, creation_key=creation_key)
    if not target:
        return ""
    return (
        "\n\nNEW AI IMAGE FOCAL-DETAIL VARIETY — issue #2876\n"
        f"Among these {requested_count} NEW AI-generated image prompts, aim for approximately "
        f"{target} image(s) with an interesting, visibly detailed feature that would "
        "look compelling if a creator later chose to zoom in. "
        "For that subset, make an authentic recognizable focal element (for example "
        "a clock face, decorative dome, skate blade, mosaic, sculpture or texture) "
        "clear and sharp, with useful surrounding context; keep the image itself "
        "naturally composed instead of pre-cropping to a macro shot. "
        "Do not force every generated image into close-up framing. "
        f"Relevant {market or 'market'} examples ONLY when on-topic: "
        f"{market_closeup_examples(market)}. "
        "Preserve the requested aspect ratio and safe margins; don't burn in text, "
        "logos or UI. Do not fabricate actual landmark details or cross cities. "
        "This applies ONLY to brand-new AI-generated images, never to creator-supplied "
        "photos, library assets, existing rendered outputs or approved imagery. "
        "Never replace, crop, overwrite, re-rank or modify existing media. "
        "Preserve all existing slide counts, subject, provenance and approval rules."
    )


def cover_closeup_guidance(*, market: str = "", creation_key: str = "") -> str:
    """Stable opt-in for ~1/3 of NEW AI-created covers; never change old covers."""
    share = extreme_closeup_share()
    if not share or not _stable_eligible(creation_key, share):
        return ""
    return (
        "NEW AI COVER FOCAL-DETAIL OPTION (issue #2876): For this brand-new image, "
        "include one interesting, sharply rendered real-world feature with enough "
        "natural context that a creator COULD choose a close-up in a later, separate "
        "creative step. Do not crop or zoom the original, or make an excessive macro "
        "the default. Relevant real local subjects: "
        f"{market_closeup_examples(market)}. "
        "Respect the requested aspect ratio, brand lettering and safe margins, "
        "avoid fabricated landmark geometry and honor any explicit creator framing. "
        "Never substitute, recrop, regenerate or overwrite an existing library "
        "image, finished thumbnail or approved/published image merely for this style."
    )
