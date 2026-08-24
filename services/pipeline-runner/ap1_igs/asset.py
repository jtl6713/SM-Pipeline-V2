from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from carousel.timeutil import chicago_now
from render.fields import field_str


def story_asset_url(record: dict[str, Any]) -> str:
    return field_str(record, "IG_Story_Asset_URL") or field_str(record, "Publish_Asset_URL")


def cache_busted_story_url(record: dict[str, Any], now: datetime | None = None) -> str:
    url = story_asset_url(record)
    if not url:
        return ""
    stamp = (now or chicago_now()).strftime("%Y%m%d%H%M%S")
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["v"] = stamp
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
