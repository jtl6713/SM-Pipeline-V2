"""Vibe Cut helpers for music-driven montage produce.

Studio stamps Production_Notes with ez-input=vibe-cut and a [vibe-cut] JSON
directive. Scene detection reuses t1.scenes; music analysis reuses Timing Engine.
The Worker /api/vibe-cut/plan endpoint owns cut proposal math today; this package
is the pipeline-side home for deeper source analysis as it lands.
"""

from __future__ import annotations

import json
import re
from typing import Any

VIBE_CUT_INPUT = "vibe-cut"
VIBE_CUT_DIRECTIVE_RE = re.compile(
    r"(?:^|\n)\[vibe-cut\]\s*(\{.*?\})\s*(?:\n|$)",
    re.IGNORECASE | re.DOTALL,
)


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
    return payload


def vibe_cut_skips_voiceover(notes: str | None) -> bool:
    return is_vibe_cut_notes(notes)
