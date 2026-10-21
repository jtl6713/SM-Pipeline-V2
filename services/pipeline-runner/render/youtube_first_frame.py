"""Gate YouTube-specific encoded first frames without changing other platforms."""
from __future__ import annotations

import os

from render.fields import field_str


def youtube_first_frame_enabled_for_output(output: dict) -> bool:
    if field_str(output, "Platform").strip().casefold() != "youtube":
        return False
    mode = os.environ.get("YOUTUBE_FIRST_FRAME_MODE", "off").strip().casefold()
    if mode == "all":
        return True
    if mode != "canary":
        return False
    canary_ids = {
        token.strip()
        for token in os.environ.get("YOUTUBE_FIRST_FRAME_CANARY_OUTPUT_IDS", "").split(",")
        if token.strip()
    }
    return (
        str(output.get("id") or "").strip() in canary_ids
        or field_str(output, "Output_ID") in canary_ids
    )
