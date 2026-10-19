"""Profile-scoped creative guidance shared by thumbnail and narration writers.

Read-only Airtable Pipeline Settings lookup; Content Profiles and existing
generation defaults are never rewritten by this module.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from airtable.constants import PIPELINE_SETTINGS_TABLE

_LOG = logging.getLogger("pipeline-runner.profile-creative")
_FIELDS = ("shared_direction", "thumbnail_instructions", "narration_instructions")
_ID = re.compile(r"^rec[A-Za-z0-9]{14}$")


def _fields(record: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    inner = record.get("fields")
    return inner if isinstance(inner, dict) else record


def profile_id_from_records(*records: dict[str, Any] | None) -> str:
    """Only accept an explicit Content Profile linkage; never infer by city."""
    for record in records:
        values = _fields(record)
        for key in ("Content_Profile", "Content Profile", "Content_Profiles", "Content_Profile_ID"):
            raw = values.get(key)
            items = raw if isinstance(raw, list) else [raw]
            for item in items:
                value = item.get("id") if isinstance(item, dict) else item
                if _ID.fullmatch(str(value or "")):
                    return str(value)
    return ""


def parse_creative_guidance(raw: Any) -> dict[str, str]:
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        value = {}
    if not isinstance(value, dict):
        value = {}
    return {key: str(value.get(key) or "").strip()[:4000] for key in _FIELDS}


def load_profile_creative_guidance(client: Any, *records: dict[str, Any] | None) -> dict[str, str]:
    profile_id = profile_id_from_records(*records)
    if not profile_id:
        return parse_creative_guidance({})
    name = "Studio_Profile_Creative_" + profile_id
    try:
        # The profile ID is strictly validated before being interpolated.
        rows = client.list_records(
            PIPELINE_SETTINGS_TABLE,
            formula='AND({Active}=1,{Setting_Name}="' + name + '")',
            max_records=1,
        )
        return parse_creative_guidance(_fields(rows[0]).get("Setting_Value") if rows else "")
    except Exception as error:
        _LOG.warning("Creative direction lookup failed for %s; using defaults: %s", profile_id, error)
        return parse_creative_guidance({})


def creative_prompt_suffix(guidance: dict[str, Any] | None, *, mode: str) -> str:
    """Instructions supplement, but cannot remove platform/factual safety rules."""
    data = parse_creative_guidance(guidance)
    if mode not in ("thumbnail", "narration"):
        raise ValueError("mode must be thumbnail or narration")
    specific = "thumbnail_instructions" if mode == "thumbnail" else "narration_instructions"
    shared = data["shared_direction"]
    unique = data[specific]
    if not shared and not unique:
        return ""
    blocks = [
        "\nPROFILE-SPECIFIC CREATIVE DIRECTION (apply only where consistent with source assets,"
        " verified facts, exact scripts, platform formatting and safety requirements):",
    ]
    if shared:
        blocks.append("Shared style for both visuals and narration: " + shared)
    if unique:
        blocks.append(("Thumbnail composition: " if mode == "thumbnail" else "Spoken narration style: ") + unique)
    return "\n".join(blocks)
