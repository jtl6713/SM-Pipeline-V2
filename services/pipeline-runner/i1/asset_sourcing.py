"""Canonical Supabase-only media-aware I1 sourcing (#2647).

Media inventory is *not* proof that images fit an idea. Suggested asset IDs
are proposals for explicit human review; production readiness is gated by
the existing media/rights/ownership checks. No legacy Airtable transport.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from supabase_pipeline import _rest

MODES = frozenset({"existing", "balanced", "explore"})
GENERIC_PLACES = frozenset({
    "miami", "chicago", "new york", "new york city", "nyc", "los angeles",
    "la", "florida", "illinois", "california", "usa", "united states",
    "manhattan", "downtown", "city", "museum", "park",
})
SKIP_TERMS = frozenset({
    "the", "at", "in", "a", "and", "of", "on", "by", "with", "florida",
    "chicago", "miami", "new", "york", "city", "los", "angeles", "museum",
    "gardens", "park", "beach", "building", "bridge", "district", "state",
})
MAX_RAW_PER_ROLE = 1000
MAX_IDEA_HISTORY = 1200


def sourcing_mode(value: str | None) -> str:
    mode = str(value or "balanced").strip().lower()
    if mode not in MODES:
        raise ValueError("asset_sourcing_mode must be existing, balanced, or explore")
    return mode


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(value or "").lower())


def topic_key(value: str) -> str:
    """Use distinctive place words; never let generic city labels mask diversity."""
    words = _tokens(str(value or "").split(",")[0])
    if "vizcaya" in words:
        return "vizcaya"
    useful = [word for word in words if word not in SKIP_TERMS]
    if not useful:
        return ""
    return "".join(useful[:2])


def _request(settings: dict, path: str) -> list[dict]:
    result = _rest(settings, path, "GET")
    if not isinstance(result, list) or not all(isinstance(row, dict) for row in result):
        raise RuntimeError("Supabase sourcing inventory did not return a verified list")
    return result


def _read_profile_uuid(settings: dict, profile_id: str) -> str:
    rows = _request(
        settings, "content_profiles?select=id,airtable_record_id"
        "&airtable_record_id=eq." + quote(profile_id, safe="") + "&limit=2",
    )
    if len(rows) != 1 or rows[0].get("airtable_record_id") != profile_id:
        raise RuntimeError("Canonical content profile identity unavailable")
    return str(rows[0]["id"])


def _read_source_media(settings: dict, profile_id: str) -> list[dict]:
    """Read RAW sources only; never count generated aspect crops as new photos."""
    verified = []
    for role in ("Raw Photo", "Raw Footage"):
        url = (
            "media_assets?select=airtable_record_id,asset_name,asset_role,"
            "media_class,asset_status,active,do_not_use,google_drive_file_id,metadata"
            "&metadata->>content_profile_airtable_id=eq."
            + quote(profile_id, safe="")
            + "&asset_role=eq." + quote(role, safe="")
            + "&asset_status=eq.Available&active=eq.true&do_not_use=eq.false"
            + "&google_drive_file_id=not.is.null"
            + "&order=created_at.desc&limit=" + str(MAX_RAW_PER_ROLE)
        )
        rows = _request(settings, url)
        # A capped inventory must NEVER be mistaken for complete coverage.
        if len(rows) >= MAX_RAW_PER_ROLE:
            raise RuntimeError("Canonical source-media inventory needs pagination")
        for row in rows:
            meta = row.get("metadata")
            if not isinstance(meta, dict):
                continue
            if (
                meta.get("content_profile_airtable_id") != profile_id
                or str(meta.get("rights_status") or "").lower() != "owned"
                or str(meta.get("classification_status") or "") != "Classified"
                or row.get("asset_role") != role
                or row.get("asset_status") != "Available"
                or row.get("active") is not True
                or row.get("do_not_use") is not False
                or not str(row.get("google_drive_file_id") or "").strip()
                or not re.fullmatch(r"rec[A-Za-z0-9]{14}", str(row.get("airtable_record_id") or ""))
            ):
                continue
            location = str(meta.get("location") or "").strip()[:140]
            if not topic_key(location):
                continue
            verified.append({
                "id": row["airtable_record_id"],
                "name": str(row.get("asset_name") or "")[:140],
                "location": location,
                "key": topic_key(location),
                "media_class": str(row.get("media_class") or ""),
            })
    return verified


def _read_idea_history(settings: dict, profile_uuid: str) -> list[dict]:
    """Recent editorial coverage scoped to the exact profile UUID."""
    since = (datetime.now(timezone.utc) - timedelta(days=120)).isoformat()
    rows = _request(
        settings,
        "idea_candidates?select=candidate_title,payload,created_at"
        "&content_profile_id=eq." + quote(profile_uuid, safe="")
        + "&created_at=gte." + quote(since, safe=":-T+")
        + "&order=created_at.desc&limit=" + str(MAX_IDEA_HISTORY),
    )
    # If at the bound, this is only a recent snapshot, never full history.
    # The unchanged mandatory 365-day duplicate-title gate stays authoritative.
    return rows


def load_sourcing_context(settings: dict, profile_id: str, mode: str) -> dict:
    mode = sourcing_mode(mode)
    context = {
        "mode": mode, "available": False, "assets": [], "recent": [],
        "location_counts": {}, "overused": [], "locations": [],
    }
    if not settings:
        return context
    # Model proposals remain producible without library data; no fabricated
    # asset match is ever created on a transient read failure.
    try:
        uuid = _read_profile_uuid(settings, profile_id)
        context["assets"] = _read_source_media(settings, profile_id)
        context["recent"] = _read_idea_history(settings, uuid)
        context["available"] = True
    except Exception as error:
        context["inventory_error"] = type(error).__name__
        return context

    asset_locations: dict[str, str] = {}
    asset_counts: Counter[str] = Counter()
    for asset in context["assets"]:
        key = asset["key"]
        asset_locations.setdefault(key, asset["location"].split(",")[0])
        asset_counts[key] += 1
    historic = Counter()
    for row in context["recent"]:
        payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        location = topic_key(payload.get("Primary_Location", ""))
        title = " ".join(_tokens(row.get("candidate_title", "")))
        # Prefer a named primary location, but catch legacy rows missing one.
        for key in asset_locations:
            phrase = asset_locations[key].lower()
            if (
                (location and location == key)
                or (key == "vizcaya" and "vizcaya" in title.split())
                or (phrase and phrase in title)
            ):
                historic[key] += 1
    context["location_counts"] = dict(historic)
    context["overused"] = [
        asset_locations[key] for key, count in historic.most_common()
        if count >= 5
    ][:20]
    context["locations"] = [
        {"name": asset_locations[key], "source_assets": asset_counts[key],
         "recent_ideas": historic.get(key, 0)}
        for key in sorted(asset_locations, key=lambda k: (historic.get(k, 0), -asset_counts[k], k))
    ][:35]
    return context


def sourcing_prompt(context: dict) -> str:
    mode = sourcing_mode(context.get("mode"))
    availability = bool(context.get("available"))
    locations = context.get("locations") or []
    places = "; ".join(
        f"{item['name']} ({item['source_assets']} raw source assets, "
        f"{item['recent_ideas']} recent ideas)"
        for item in locations[:24]
    )
    overused = ", ".join(context.get("overused") or []) or "none verified"
    mode_guidance = {
        "existing": "Favor underused locations with genuine eligible raw photo/footage sources. Do NOT fill the slate with one heavily covered attraction.",
        "balanced": "Aim for roughly half underused library-supported subjects and half novel subjects; novelty must not depend on existing media.",
        "explore": "Prioritize new editorial subjects and undercovered neighborhoods even if capturing new photos or clips is required. Avoid overused attractions.",
    }[mode]
    return (
        "\n\nASSET SOURCING STRATEGY V1 — user choice: " + mode + "\n"
        + mode_guidance + "\n"
        + ("Current verified same-profile RAW source locations (NOT automatically approved for use): "
           + (places or "no eligible source media found") + "\n"
           if availability else
           "Current library inventory was NOT verified; do not claim any media is already available.\n")
        + "Recent high-frequency attractions/places to avoid repeating: " + overused + ".\n"
        + "Each idea MUST give a specific, realistic 1–3-part required_assets capture checklist; "
          "do not claim any image is available without verified inventory evidence. "
          "An idea requiring new photos is valid and remains a pre-production Draft until assets are provided. "
          "Use varied exact neighborhoods/landmarks instead of generic city-level locations. "
          "Never reference another profile's media."
    )


def _checklist(idea: dict) -> list[str]:
    raw = str(idea.get("required_assets") or idea.get("suggested_visuals") or "").strip()
    parts = [
        part.strip(" .;-")[:95] for part in re.split(r"[,;\n]+", raw)
        if part.strip(" .;-")
    ][:5]
    return parts or ["Capture an establishing shot and location-specific detail"]


def _is_location_match(location: str, asset: dict) -> bool:
    key = topic_key(location)
    if not key:
        return False
    return key == asset.get("key")


def idea_sourcing_fields(idea: dict, context: dict) -> dict:
    mode = sourcing_mode(context.get("mode"))
    location = str(idea.get("primary_location") or idea.get("neighborhood_or_area") or "").strip()
    possible = [
        asset["id"] for asset in context.get("assets", [])
        if _is_location_match(location, asset)
    ][:8]
    # These are suggestions only, never verified selections. The existing
    # explicit media attachment + ownership + rights gates remain decisive.
    readiness = (
        "Library candidates" if len(possible) >= 3 else
        "Partial" if possible else "Needs new media"
    )
    fields = {
        "Asset_Sourcing_Mode": mode,
        "Asset_Readiness": readiness,
        "Required_Asset_Checklist": _checklist(idea),
        "Suggested_Library_Asset_IDs": possible,
        "Verified_Library_Asset_IDs": [],
        "Sourcing_Topic_Key": topic_key(location),
    }
    if not context.get("available"):
        fields["Asset_Readiness"] = "Needs new media"
        fields["Suggested_Library_Asset_IDs"] = []
    return fields


def overused_topic(idea: dict, context: dict) -> bool:
    if context.get("mode") == "existing":
        return False
    location = topic_key(idea.get("primary_location", ""))
    title = " ".join(_tokens(idea.get("candidate_title", "")))
    for named in context.get("overused") or []:
        key = topic_key(named)
        if key and (key == location or (key == "vizcaya" and "vizcaya" in title.split())):
            return True
    return False
