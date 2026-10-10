"""Vibe Cut helpers for music-driven montage produce.

Studio stamps Production_Notes with ez-input=vibe-cut and a [vibe-cut] JSON
directive. Stamp expands one long master into many trim sources; T1 can still
snap those clips onto beats. Scene detection can replace provisional selects later.
"""

from __future__ import annotations

import json
import re
from typing import Any

from vibe_cut.edit import (
    build_vibe_cut_edit,
    default_config,
    desired_clip_count,
    expand_master_to_vibe_sources,
    provisional_selects_from_duration,
    style_params,
)

VIBE_CUT_INPUT = "vibe-cut"
VIBE_CUT_DIRECTIVE_RE = re.compile(
    r"(?:^|\n)\[vibe-cut\]\s*(\{.*?\})\s*(?:\n|$)",
    re.IGNORECASE | re.DOTALL,
)

__all__ = [
    "VIBE_CUT_INPUT",
    "build_vibe_cut_edit",
    "default_config",
    "desired_clip_count",
    "expand_master_to_vibe_sources",
    "is_vibe_cut_notes",
    "parse_vibe_cut_directive",
    "provisional_selects_from_duration",
    "style_params",
    "vibe_cut_skips_voiceover",
    "vibe_cut_target_seconds",
]


def is_vibe_cut_notes(notes: str | None) -> bool:
    text = str(notes or "")
    if re.search(r"ez-input=vibe-cut", text, re.IGNORECASE):
        return True
    return bool(VIBE_CUT_DIRECTIVE_RE.search(text))


def parse_vibe_cut_directive(notes: str | None) -> dict[str, Any] | None:
    match = VIBE_CUT_DIRECTIVE_RE.search(str(notes or ""))
    if not match:
        return None
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    return default_config(payload)


def vibe_cut_skips_voiceover(notes: str | None) -> bool:
    return is_vibe_cut_notes(notes)


def vibe_cut_target_seconds(notes: str | None, *, fallback: float = 30.0) -> float:
    directive = parse_vibe_cut_directive(notes)
    if not directive:
        return float(fallback or 30)
    try:
        return float(directive.get("target_seconds") or fallback or 30)
    except (TypeError, ValueError):
        return float(fallback or 30)
