from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from carousel.timeutil import chicago_now
from fbs3.constants import DEFAULT_TITLE
from render.fields import field_str


def reel_description(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")[:4500]
    hashtags = field_str(record, "Output_Hashtags")[:450]
    if caption and hashtags:
        return f"{caption}\n\n{hashtags}"
    return caption or hashtags


def reel_title(record: dict[str, Any]) -> str:
    title = (
        field_str(record, "Output_Title")
        or field_str(record, "Title_Text")
        or field_str(record, "Output_Caption")
        or DEFAULT_TITLE
    )
    return title.strip()[:255] or DEFAULT_TITLE


def public_mp4_url(record: dict[str, Any]) -> str:
    return field_str(record, "FB_Slideshow_Public_URL")


def cache_busted_public_url(record: dict[str, Any], now: datetime | None = None) -> str:
    url = public_mp4_url(record)
    if not url:
        return ""
    stamp = (now or chicago_now()).strftime("%Y%m%d%H%M%S")
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["v"] = stamp
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
