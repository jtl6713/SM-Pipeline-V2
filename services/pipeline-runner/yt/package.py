from __future__ import annotations

import json
import re
from typing import Any

from asset.helpers import as_bool
from item4.settings import PipelineSettings
from p3.helpers import caption_with_hashtags
from publish.location import PublishLocation, append_location_line
from render.fields import field, field_str
from ap0.public_cover import native_grid_cover_required
from yt.constants import DEFAULT_CATEGORY_ID, DEFAULT_PRIVACY, THUMB_NOT_NEEDED, THUMB_PENDING

_HASHTAG = re.compile(r"#([^\s#]+)")
_TAG_SPLIT = re.compile(r"[\s,;]+")
YOUTUBE_TAGS_CHAR_BUDGET = 500


def setting_is_true(value: str) -> bool:
    return str(value or "").strip().casefold() in {"true", "1", "yes", "on"}


def youtube_thumbnail_publish_enabled(settings: PipelineSettings | None = None) -> bool:
    """YouTube thumbnails.set is paused unless this setting is explicitly on."""
    raw = settings.get("YOUTUBE_AUTO_UPLOAD_THUMBNAIL") if settings is not None else ""
    return setting_is_true(raw)


def youtube_defaults(settings: PipelineSettings) -> dict[str, str]:
    return {
        "privacy": settings.get("YOUTUBE_DEFAULT_PRIVACY"),
        "category_id": settings.get("YOUTUBE_DEFAULT_CATEGORY_ID"),
        "made_for_kids": settings.get("YOUTUBE_DEFAULT_MADE_FOR_KIDS"),
        "synthetic": settings.get("YOUTUBE_DEFAULT_CONTAINS_SYNTHETIC_MEDIA"),
    }


def strip_leading_title(body: str, title: str) -> str:
    """Remove a duplicated title line from caption body for YouTube descriptions.

    Studio captions are often stored as ``title\\nbody``. YouTube already has a
    separate title field, so the description should not repeat that title.
    """
    text = str(body or "").strip()
    heading = str(title or "").strip()
    if not text or not heading:
        return text
    lines = text.splitlines()
    first = lines[0].strip() if lines else ""
    if first.casefold() == heading.casefold():
        return "\n".join(lines[1:]).lstrip("\n").strip()
    return text


def hashtag_tokens(*texts: str, allow_plain: bool = False) -> list[str]:
    """Parse Airtable hashtags / #tokens into YouTube Studio tags (no #)."""
    seen: set[str] = set()
    tags: list[str] = []
    used = 0
    for text in texts:
        raw = str(text or "").strip()
        if not raw:
            continue
        hashed = [part.strip() for part in _HASHTAG.findall(raw)]
        if hashed:
            parts = hashed
        elif allow_plain:
            parts = [part.strip() for part in _TAG_SPLIT.split(raw)]
        else:
            continue
        for part in parts:
            tag = part.lstrip("#").strip(".,;:!").strip()
            if not tag:
                continue
            key = tag.casefold()
            if key in seen:
                continue
            extra = len(tag) + (1 if tags else 0)
            if used + extra > YOUTUBE_TAGS_CHAR_BUDGET:
                continue
            seen.add(key)
            tags.append(tag)
            used += extra
    return tags


def youtube_tags(record: dict[str, Any]) -> list[str]:
    tagged = hashtag_tokens(field_str(record, "Output_Hashtags"), allow_plain=True)
    if tagged:
        extra = hashtag_tokens(field_str(record, "Output_Caption"))
        return hashtag_tokens(" ".join(f"#{tag}" for tag in tagged + extra))
    return hashtag_tokens(field_str(record, "Output_Caption"))


def description_final(
    record: dict[str, Any],
    *,
    location: PublishLocation | None = None,
) -> str:
    title = field_str(record, "Output_Title")
    # Prefer Output_Caption so a previously stored YouTube_Description_Final that
    # still includes the title can be corrected on the next YT0 prepare.
    body = field_str(record, "Output_Caption") or field_str(record, "YouTube_Description_Final")
    body = strip_leading_title(body, title)
    hashtags = field_str(record, "Output_Hashtags")
    text = caption_with_hashtags(body, hashtags)
    # YouTube Data API recordingDetails.location* is deprecated; keep place as text.
    return append_location_line(text, location)


def idempotency_key(record: dict[str, Any]) -> str:
    output_id = field_str(record, "Output_ID") or "unknown"
    record_id = str(record.get("id") or "").strip()
    txn = field_str(record, "Replace_Transaction_ID") or "BASE"
    return f"YT-{output_id}-{record_id}-{txn}"


def thumbnail_status(record: dict[str, Any]) -> str:
    current = field_str(record, "YouTube_Thumbnail_Status")
    if current:
        return current
    if native_grid_cover_required(record):
        return THUMB_PENDING
    return THUMB_PENDING if field_str(record, "Thumbnail_URL") else THUMB_NOT_NEEDED


def package_fields(
    record: dict[str, Any],
    defaults: dict[str, str],
    *,
    source_url: str,
    prepared_at: str,
    location: PublishLocation | None = None,
) -> dict[str, Any]:
    made_for_kids = field(record, "YouTube_Made_For_Kids")
    if made_for_kids is None or made_for_kids == "":
        made_for_kids = setting_is_true(defaults.get("made_for_kids", ""))
    synthetic = field(record, "YouTube_Contains_Synthetic_Media")
    if synthetic is None or synthetic == "":
        synthetic = setting_is_true(defaults.get("synthetic", ""))
    fields = {
        "YouTube_Category_ID": field_str(record, "YouTube_Category_ID")
        or defaults.get("category_id")
        or DEFAULT_CATEGORY_ID,
        "YouTube_Privacy_Status": field_str(record, "YouTube_Privacy_Status")
        or defaults.get("privacy")
        or DEFAULT_PRIVACY,
        "YouTube_Made_For_Kids": as_bool(made_for_kids, False),
        "YouTube_Contains_Synthetic_Media": as_bool(synthetic, False),
        "YouTube_Description_Final": description_final(record, location=location),
        "YouTube_Tags_JSON": json.dumps(youtube_tags(record), ensure_ascii=False),
        "YouTube_Idempotency_Key": field_str(record, "YouTube_Idempotency_Key") or idempotency_key(record),
        "YouTube_Thumbnail_Status": thumbnail_status(record),
        "YouTube_Response_JSON": (
            f'{{"prepared_by":"YT0","prepared_at":"{prepared_at}","source_url":"{source_url}"}}'
        ),
    }
    content_class = field_str(record, "YouTube_Content_Class")
    if content_class:
        fields["YouTube_Content_Class"] = content_class
    return fields
