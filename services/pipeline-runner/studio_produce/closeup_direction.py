"""Issue #2876: shared extreme-close-up visual direction for Shining profiles.

Prompt-only preference. No media mutation, generation calls, approval changes,
or publishing decisions occur here. An environment setting allows cautious
rollout without introducing a new database field or implicit asset authority.
"""

from __future__ import annotations

import math
import os

DEFAULT_EXTREME_CLOSEUP_SHARE = 0.5
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
    """Configured candidate-set preference (0 disables it, 1 favors all eligible).

    Ignore invalid configuration rather than silently enabling an unexpected
    extreme setting. The default is the owner's initial 50% creative target.
    """
    value = os.environ.get(CLOSEUP_SHARE_ENV, "") if raw is None else raw
    if str(value or "").strip() == "":
        return DEFAULT_EXTREME_CLOSEUP_SHARE
    try:
        share = float(str(value).strip())
    except (TypeError, ValueError):
        return DEFAULT_EXTREME_CLOSEUP_SHARE
    return share if math.isfinite(share) and 0 <= share <= 1 else DEFAULT_EXTREME_CLOSEUP_SHARE


def closeup_target(count: int, share: float | None = None) -> int:
    """Editorial guidance for candidate batches, not an auto-approval quota."""
    total = max(0, int(count))
    fraction = extreme_closeup_share() if share is None else share
    if not math.isfinite(fraction) or not 0 <= fraction <= 1:
        fraction = DEFAULT_EXTREME_CLOSEUP_SHARE
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
    return "verified landmark details, meaningful objects, signs, textures, and seasonal activity close-ups"


def idea_closeup_guidance(*, market: str, candidates: int) -> str:
    share = extreme_closeup_share()
    if not share or candidates <= 0:
        return ""
    target = closeup_target(candidates, share)
    return (
        "\n\nEXTREME CLOSE-UP CREATIVE PRIORITY — issue #2876\n"
        f"For this {candidates}-candidate slate, aim for approximately {target} "
        "visually eligible ideas with a CLOSE-UP HERO opportunity (not a rigid quota). "
        "Write a specific, shootable extreme-close-up in suggested_visuals and "
        "required_assets when appropriate; keep their existing word limits and JSON schema. "
        "Make one distinctive, relevant subject/detail occupy roughly 65–90% of the frame. "
        "Think Wrigley Building clock filling the screen or a photorealistic ice-skate "
        "boot/blade macro, not a generic skyline or wide travel postcard. "
        f"Relevant {market or 'market'} possibilities, only when actually on-topic: "
        f"{market_closeup_examples(market)}. "
        "Still include establishing/context shots when necessary to identify a place "
        "or explain a route; do not force close-ups on text-only ideas. "
        "Do not invent real-world landmark features, promise unavailable source media, "
        "or cross markets. Existing rights, provenance, and approval gates remain binding."
    )


def ai_slide_closeup_guidance(*, market: str, requested_count: int) -> str:
    share = extreme_closeup_share()
    if not share or requested_count <= 0:
        return ""
    target = closeup_target(requested_count, share)
    return (
        "\n\nAI SLIDE EXTREME CLOSE-UP DIRECTION — issue #2876\n"
        f"Among {requested_count} AI-generated slide image prompts, aim for approximately "
        f"{target} visually suitable extreme-close-up/macro compositions. "
        "For those, show one highly specific, recognizable object or true landmark "
        "detail filling about 65–90% of a photorealistic vertical 9:16 image, "
        "with striking textures and lighting. Keep the caption overlay safe area clear; "
        "do not render words, logos, or UI into the generated photo. "
        f"Possible {market or 'market'} visual subjects when relevant: "
        f"{market_closeup_examples(market)}. "
        "Do not replace a requested attraction with an unrelated decorative object. "
        "If tight framing obscures the location or risks fabricated landmark geometry, "
        "use a truthful medium/establishing composition instead. "
        "Preserve all existing slide-count, subject, profile, and approval rules."
    )


def cover_closeup_guidance(*, market: str = "") -> str:
    if not extreme_closeup_share():
        return ""
    return (
        "VISUAL HERO PREFERENCE (issue #2876): When it fits the named subject, "
        "favor an extraordinary, true-to-place close-up rather than a generic wide "
        "cityscape: a single recognizable clock, dome, skate, architectural detail, "
        "or sign should dominate roughly 65–90% of the photo. "
        f"Market-appropriate inspiration: {market_closeup_examples(market)}. "
        "Keep cover lettering readable without hiding the hero subject; respect "
        "the requested aspect ratio and existing safe margins. Do not fabricate "
        "the landmark, invent source imagery, or override an explicit composition "
        "requested by the creator. Use an establishing shot when context matters."
    )
