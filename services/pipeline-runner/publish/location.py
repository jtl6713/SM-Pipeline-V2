"""Resolve a publish location from Content Item / output copy and Meta place IDs."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE
from item4.settings import PipelineSettings
from publish.chicago_places import CHICAGO_PLACE_NAMES, CHICAGO_PLACE_PAGE_IDS
from render.fields import field, field_str, first_linked_id

_WS = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]+")


@dataclass(frozen=True)
class PublishLocation:
    name: str
    page_id: str | None = None
    market: str = ""
    source: str = ""
    query: str = ""

    @property
    def label(self) -> str:
        name = (self.name or "").strip()
        market = (self.market or "").strip()
        if name and market and market.casefold() not in name.casefold():
            return f"{name}, {market}"
        return name or market

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["label"] = self.label
        return data


def _norm(value: Any) -> str:
    text = _NON_ALNUM.sub(" ", str(value or "").casefold())
    return _WS.sub(" ", text).strip()


def _market_name(record: dict[str, Any] | None) -> str:
    if not record:
        return ""
    raw = field(record, "Market_Name")
    if isinstance(raw, list):
        parts = [str(item or "").strip() for item in raw if str(item or "").strip()]
        return parts[0] if parts else ""
    return field_str(record, "Market_Name")


def _content_item_for_output(client: AirtableClient, output: dict[str, Any]) -> dict[str, Any] | None:
    content_id = first_linked_id(field(output, "Content_Item"))
    if not content_id:
        return None
    try:
        return client.get_record(CONTENT_ITEMS_TABLE, content_id)
    except Exception:
        return None


def _haystack(*parts: Any) -> str:
    return " ".join(str(part or "").strip() for part in parts if str(part or "").strip())


def _match_known_place(text: str) -> str | None:
    hay = _norm(text)
    if not hay:
        return None
    padded = f" {hay} "
    for name in CHICAGO_PLACE_NAMES:
        if f" {name} " in padded:
            return name
    return None


def location_text_from_records(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    """Return (place_name, market, source) from structured fields then free text."""
    market = _market_name(content_item) or _market_name(output)

    primary = field_str(content_item or {}, "Primary_Location")
    if primary:
        return primary.strip(), market, "content.Primary_Location"

    area = field_str(content_item or {}, "Neighborhood_or_Area")
    if area:
        return area.strip(), market, "content.Neighborhood_or_Area"

    blob = _haystack(
        field_str(content_item or {}, "Content_Title"),
        field_str(content_item or {}, "Idea_Summary"),
        field_str(content_item or {}, "Hook"),
        field_str(content_item or {}, "Caption"),
        field_str(output, "Output_Title"),
        field_str(output, "Title_Text"),
        field_str(output, "Output_Caption"),
    )
    matched = _match_known_place(blob)
    if matched:
        # Prefer title-cased display from the known key.
        display = " ".join(part.capitalize() if part != "the" else "The" for part in matched.split())
        if matched == "the loop":
            display = "The Loop"
        return display, market, "copy_match"

    if market:
        return market.strip(), market, "market_fallback"
    return "", "", ""


def _override_page_ids(settings: PipelineSettings | None) -> dict[str, str]:
    if settings is None:
        return {}
    raw = settings.get("PUBLISH_LOCATION_PAGE_IDS_JSON") or settings.get("META_PLACE_PAGE_IDS_JSON")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in parsed.items():
        name = _norm(key)
        page_id = str(value or "").strip()
        if name and page_id.isdigit():
            out[name] = page_id
    return out


def lookup_place_page_id(
    name: str,
    *,
    settings: PipelineSettings | None = None,
    token: str = "",
    version: str = "v25.0",
) -> tuple[str | None, str]:
    """Resolve a Meta location page id. Returns (page_id, resolution_source)."""
    key = _norm(name)
    if not key:
        return None, ""

    overrides = _override_page_ids(settings)
    if key in overrides:
        return overrides[key], "settings_override"

    # Prefer exact curated match, then longest contained curated name.
    if key in CHICAGO_PLACE_PAGE_IDS:
        return CHICAGO_PLACE_PAGE_IDS[key], "chicago_places"
    for place_name in CHICAGO_PLACE_NAMES:
        if place_name in key or key in place_name:
            return CHICAGO_PLACE_PAGE_IDS[place_name], "chicago_places_fuzzy"

    if token:
        page_id = search_pages_for_place(name, token=token, version=version)
        if page_id:
            return page_id, "pages_search"

    return None, ""


def search_pages_for_place(
    query: str,
    *,
    token: str,
    version: str = "v25.0",
    timeout_s: float = 20.0,
) -> str | None:
    """Best-effort Pages Search. Requires Page Public Metadata Access."""
    q = str(query or "").strip()
    if not q or not token:
        return None
    url = f"https://graph.facebook.com/{version.strip().strip('/')}/pages/search"
    try:
        response = requests.get(
            url,
            params={"q": q, "fields": "id,name,location", "access_token": token},
            timeout=timeout_s,
        )
        payload = response.json() if response.content else {}
    except requests.RequestException:
        return None
    if not response.ok:
        return None
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return None
    for row in rows:
        if not isinstance(row, dict):
            continue
        page_id = str(row.get("id") or "").strip()
        location = row.get("location")
        if page_id.isdigit() and isinstance(location, dict) and location:
            return page_id
    return None


def resolve_publish_location(
    client: AirtableClient | None,
    output: dict[str, Any],
    *,
    settings: PipelineSettings | None = None,
    content_item: dict[str, Any] | None = None,
    token: str = "",
    version: str = "v25.0",
) -> PublishLocation | None:
    item = content_item
    if item is None and client is not None:
        item = _content_item_for_output(client, output)

    name, market, source = location_text_from_records(output=output, content_item=item)
    if not name:
        return None

    query = f"{name}, {market}".strip().strip(",") if market else name
    page_id, page_source = lookup_place_page_id(
        name,
        settings=settings,
        token=token,
        version=version,
    )
    if not page_id and market and _norm(name) != _norm(market):
        page_id, page_source = lookup_place_page_id(
            market,
            settings=settings,
            token=token,
            version=version,
        )
        if page_id:
            source = f"{source}+market_page"

    return PublishLocation(
        name=name,
        page_id=page_id,
        market=market,
        source=f"{source}|{page_source}" if page_source else source,
        query=query,
    )


def append_location_line(body: str, location: PublishLocation | None) -> str:
    """Add a plain-text location line when platforms cannot accept a place tag."""
    if location is None:
        return body
    label = location.label
    if not label:
        return body
    text = str(body or "").strip()
    if label.casefold() in text.casefold():
        return text
    line = f"📍 {label}"
    if not text:
        return line
    return f"{text}\n\n{line}"
