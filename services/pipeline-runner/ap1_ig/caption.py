from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from ap0.public_cover import graph_fetchable_cover_url
from ap1_ig.constants import THUMB_OFFSET_MS
from carousel.timeutil import chicago_now
from render.fields import field_str


def graph_caption(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    if not hashtags:
        return caption
    if hashtags in caption:
        return caption
    if caption:
        return f"{caption}\n\n{hashtags}"
    return hashtags


def cache_busted_video_url(record: dict[str, Any], now: datetime | None = None) -> str:
    url = field_str(record, "Publish_Asset_URL")
    if not url:
        return ""
    stamp = (now or chicago_now()).strftime("%Y%m%d%H%M%S")
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["v"] = stamp
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def cover_url(record: dict[str, Any]) -> str:
    return graph_fetchable_cover_url(field_str(record, "Thumbnail_URL"))


def reel_create_body(
    record: dict[str, Any],
    now: datetime | None = None,
    *,
    location_id: str | None = None,
    require_native_cover: bool = True,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "media_type": "REELS",
        "video_url": cache_busted_video_url(record, now),
        "caption": graph_caption(record),
        "share_to_feed": True,
    }
    cover = cover_url(record)
    if cover:
        body["cover_url"] = cover
    elif not require_native_cover:
        body["thumb_offset"] = THUMB_OFFSET_MS
    place = str(location_id or "").strip()
    if place.isdigit():
        body["location_id"] = place
    return body
