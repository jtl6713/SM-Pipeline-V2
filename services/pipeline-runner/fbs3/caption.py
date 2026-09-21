from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from ap0.public_mp4 import is_public_publish_url
from carousel.timeutil import chicago_now
from fbs3.constants import DEFAULT_TITLE
from p3.helpers import caption_with_hashtags
from render.fields import field_str


def reel_description(record: dict[str, Any]) -> str:
    return caption_with_hashtags(
        field_str(record, "Output_Caption")[:4500],
        field_str(record, "Output_Hashtags")[:450],
    )


def reel_title(record: dict[str, Any]) -> str:
    title = (
        field_str(record, "Output_Title")
        or field_str(record, "Title_Text")
        or field_str(record, "Output_Caption")
        or DEFAULT_TITLE
    )
    return title.strip()[:255] or DEFAULT_TITLE


def public_mp4_url(record: dict[str, Any]) -> str:
    for name in ("Publish_Asset_URL", "FB_Slideshow_Public_URL"):
        url = field_str(record, name)
        if is_public_publish_url(url):
            return url
    return ""


def cache_busted_public_url(record: dict[str, Any], now: datetime | None = None) -> str:
    url = public_mp4_url(record)
    if not url:
        return ""
    stamp = (now or chicago_now()).strftime("%Y%m%d%H%M%S")
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["v"] = stamp
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
