"""City-prefixed publish credentials. LA/NYC destination keys never fall back to Chicago."""

from __future__ import annotations

import re
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_PROFILES_TABLE
from item4.settings import PipelineSettings
from publish.location import _content_item_for_output
from render.fields import field, first_linked_id

CITY_DESTINATION_KEYS = frozenset(
    {
        "FACEBOOK_PAGE_ID",
        "FACEBOOK_PAGE_ACCESS_TOKEN",
        "INSTAGRAM_BUSINESS_ACCOUNT_ID",
        "META_GRAPH_API_ACCESS_TOKEN",
        "YOUTUBE_CHANNEL_ID",
        "YOUTUBE_UPLOAD_SERVICE_URL",
        "TIKTOK_WORKER_BASE_URL",
    }
)

_LA_WORD = re.compile(r"\bla\b")


def setting_prefix(theme: str) -> str:
    if theme == "la":
        return "LA_"
    if theme == "nyc":
        return "NYC_"
    return ""


def prefixed_setting_name(name: str, theme: str) -> str:
    return f"{setting_prefix(theme)}{name}"


def _flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value if item is not None)
    if isinstance(value, dict):
        return str(value.get("name") or value.get("id") or "").strip()
    return str(value).strip()


def theme_from_records(*records: dict[str, Any] | None) -> str:
    parts: list[str] = []
    for record in records:
        if not record:
            continue
        for name in (
            "Profile_Name",
            "Market_Name",
            "Brand_Name",
            "State_Region",
            "Content_Profile_Name",
        ):
            text = _flatten_text(field(record, name))
            if text:
                parts.append(text)
    hay = " ".join(parts).casefold()
    if (
        "los angeles" in hay
        or "la shining" in hay
        or "la -" in hay
        or "hollywood" in hay
        or _LA_WORD.search(hay)
    ):
        return "la"
    if "new york" in hay or "nyc" in hay or "manhattan" in hay:
        return "nyc"
    return "chicago"


def resolve_publish_theme(
    *,
    output: dict[str, Any] | None = None,
    content_item: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
    client: AirtableClient | None = None,
) -> str:
    records: list[dict[str, Any]] = [row for row in (output, content_item, profile) if row]
    item = content_item
    if client and output is not None and item is None:
        item = _content_item_for_output(client, output)
        if item:
            records.append(item)
    if client and profile is None:
        for record in list(records):
            profile_id = first_linked_id(field(record, "Content_Profile"))
            if not profile_id:
                continue
            try:
                profile = client.get_record(CONTENT_PROFILES_TABLE, profile_id)
            except Exception:
                profile = None
            if profile:
                records.append(profile)
            break
    return theme_from_records(*records)


def destination_value(
    settings: PipelineSettings,
    name: str,
    theme: str,
) -> str:
    key = str(name or "").strip()
    if not key:
        return ""
    prefix = setting_prefix(theme)
    if prefix:
        prefixed = (settings.get(f"{prefix}{key}") or "").strip()
        if prefixed:
            return prefixed
        if key in CITY_DESTINATION_KEYS:
            return ""
    return (settings.get(key) or "").strip()
