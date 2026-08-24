"""Studio exact-source authority helpers for R2."""

from __future__ import annotations

import json
from typing import Any


def _field(record: dict[str, Any], name: str) -> str:
    return str(record.get("fields", {}).get(name) or "").strip()


def output_has_studio_exact_source(output: dict[str, Any]) -> bool:
    notes = _field(output, "Asset_Selection_Notes")
    selected_json = _field(output, "Selected_Assets_JSON")
    return (
        "Studio exact source authority" in notes
        or "studio_owner_uploaded_exact_source" in selected_json
    )


def content_item_studio_ready(content_item: dict[str, Any] | None) -> bool:
    if not content_item:
        return False
    return _field(content_item, "Studio_Source_Authority_Status") == "Ready"


def locked_visual_package(content_item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not content_item:
        return None
    raw = _field(content_item, "Studio_Source_Selected_Assets_JSON")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def requires_openai_for_output(output: dict[str, Any], content_item: dict[str, Any] | None) -> bool:
    """True when canonical GPT selection (Make module 7) is still required."""
    if output_has_studio_exact_source(output) and content_item_studio_ready(content_item):
        package = locked_visual_package(content_item)
        if package and (package.get("selected_clips") or package.get("clips")):
            # Music-only completion may still need OpenAI; defer until ported.
            return True
    return True
