"""Profile-scoped creative guidance shared by thumbnail and narration writers.

Supabase-authoritative Pipeline Settings lookup; Content Profiles and existing
generation defaults are never rewritten by this module.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import quote

from airtable.constants import PIPELINE_SETTINGS_TABLE

_LOG = logging.getLogger("pipeline-runner.profile-creative")
_FIELDS = ("shared_direction", "thumbnail_instructions", "narration_instructions", "owner_global_direction")
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


def _owner_global_for_profile(client: Any, profile_id: str) -> str:
    """Resolve owner from Supabase profile->brand->organization only; no archive reads.

    Ambiguous brands, missing links, or missing settings fail closed rather than
    exposing one tenant's prompt to a different organization.
    """
    from supabase_pipeline import _rest, studio_write_source, supabase_configured

    settings = getattr(client, "_settings", {}) or {}
    if studio_write_source(settings) != "supabase" or not supabase_configured(settings):
        return ""
    try:
        profiles = _rest(
            settings,
            "content_profiles?airtable_record_id=eq."
            + quote(profile_id, safe="")
            + "&select=platform_setup,brand_name&limit=2",
            "GET",
        )
        if not isinstance(profiles, list) or len(profiles) != 1:
            return ""
        data = profiles[0]
        setup = data.get("platform_setup") if isinstance(data.get("platform_setup"), dict) else {}
        orgs = setup.get("Organization") or []
        org_record_id = str(orgs[0]) if len(orgs) == 1 and isinstance(orgs[0], str) and _ID.fullmatch(orgs[0]) else ""
        if not org_record_id:
            brands = setup.get("Brand") or []
            brand_id = str(brands[0]) if len(brands) == 1 and isinstance(brands[0], str) and _ID.fullmatch(brands[0]) else ""
            brand_name = str(data.get("brand_name") or "").strip()
            if not brand_id and not brand_name:
                return ""
            expression = (
                "airtable_record_id=eq." + quote(brand_id, safe="")
                if brand_id else "name=eq." + quote(brand_name, safe="")
            )
            matches = _rest(settings, "brands?" + expression + "&select=organization_id&limit=2", "GET")
            if not isinstance(matches, list) or len(matches) != 1:
                return ""
            org_uuid = str(matches[0].get("organization_id") or "")
            if not org_uuid:
                return ""
            organizations = _rest(settings,
                "organizations?id=eq." + quote(org_uuid, safe="")
                + "&select=airtable_record_id&limit=2", "GET")
            if not isinstance(organizations, list) or len(organizations) != 1:
                return ""
            org_record_id = str(organizations[0].get("airtable_record_id") or "")
        if not _ID.fullmatch(org_record_id):
            return ""
        name = "Studio_Owner_Generation_" + org_record_id
        rows = client.list_records(
            PIPELINE_SETTINGS_TABLE,
            formula='AND({Active}=1,{Setting_Name}="' + name + '")',
            max_records=1,
        )
        value = _fields(rows[0]).get("Setting_Value") if rows else ""
        parsed = json.loads(value) if isinstance(value, str) and value else value
        return str((parsed or {}).get("prompt") or "").strip()[:4000] if isinstance(parsed, dict) else ""
    except Exception as error:
        _LOG.warning("Supabase owner generation guidance unavailable for %s: %s", profile_id, error)
        return ""


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
        parsed = parse_creative_guidance(_fields(rows[0]).get("Setting_Value") if rows else "")
        parsed["owner_global_direction"] = _owner_global_for_profile(client, profile_id)
        return parsed
    except Exception as error:
        _LOG.warning("Creative direction lookup failed for %s; using defaults: %s", profile_id, error)
        return parse_creative_guidance({})


def creative_prompt_suffix(guidance: dict[str, Any] | None, *, mode: str) -> str:
    """Instructions supplement, but cannot remove platform/factual safety rules."""
    data = parse_creative_guidance(guidance)
    if mode not in ("thumbnail", "narration"):
        raise ValueError("mode must be thumbnail or narration")
    specific = "thumbnail_instructions" if mode == "thumbnail" else "narration_instructions"
    owner = data["owner_global_direction"]
    shared = data["shared_direction"]
    unique = data[specific]
    if not owner and not shared and not unique:
        return ""
    blocks = [
        "\nPROFILE-SPECIFIC CREATIVE DIRECTION (apply only where consistent with source assets,"
        " verified facts, exact scripts, platform formatting and safety requirements):",
    ]
    if owner:
        blocks.append("Owner-global instructions for all profiles: " + owner)
    if shared:
        blocks.append("Shared style for both visuals and narration: " + shared)
    if unique:
        blocks.append(("Thumbnail composition: " if mode == "thumbnail" else "Spoken narration style: ") + unique)
    return "\n".join(blocks)
