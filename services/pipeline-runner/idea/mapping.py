"""I3 query-param helpers matching Make 5517182 routers."""

from __future__ import annotations

from typing import Any

from idea.constants import (
    ALL_PLATFORMS,
    CONTENT_TYPE_ALIASES,
    DEFAULT_CAROUSEL_SLIDE_COUNT,
    DEFAULT_VIDEO_DURATION,
    DEFAULT_VOICEOVER_TAIL_SECONDS,
)


def first_value(payload: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def normalize_content_type(raw: str, platforms: str = "") -> str:
    value = (raw or "").strip()
    if value == "Static Image":
        return "Thumbnail / Promo Still" if "YouTube" in (platforms or "") else "Feed Post"
    return CONTENT_TYPE_ALIASES.get(value, value)


def split_platforms(raw: str) -> list[str]:
    value = (raw or "").strip()
    if not value:
        return ["Instagram"]
    if value.lower() == "all":
        return list(ALL_PLATFORMS)
    if value.upper() == "IG":
        return ["Instagram"]
    return [part.strip() for part in value.split(",") if part.strip()]


def parse_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def parse_number(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def media_choice(value: str) -> str:
    text = (value or "").strip()
    return text or "Use Profile Default"


def video_duration_seconds(payload: dict[str, Any]) -> int:
    duration = first_value(payload, "video_duration")
    if duration == "Custom":
        return parse_int(payload.get("custom_video_duration"), DEFAULT_VIDEO_DURATION) or DEFAULT_VIDEO_DURATION
    return parse_int(duration, DEFAULT_VIDEO_DURATION) or DEFAULT_VIDEO_DURATION


def video_clip_count(payload: dict[str, Any]) -> int | None:
    raw = first_value(payload, "video_clip_count") or "Auto"
    if raw == "Auto":
        return None
    if raw == "Custom":
        return parse_int(payload.get("custom_video_clip_count"))
    return parse_int(raw)


def voiceover_tail(payload: dict[str, Any]) -> float:
    return parse_number(payload.get("voiceover_tail_seconds"), DEFAULT_VOICEOVER_TAIL_SECONDS) or DEFAULT_VOICEOVER_TAIL_SECONDS


def route_for_payload(payload: dict[str, Any]) -> str:
    action = first_value(payload, "action")
    decision = first_value(payload, "decision").lower()
    record_id = first_value(payload, "record_id")
    if not record_id:
        return "missing_record"
    if action == "carousel_form":
        return "carousel_form"
    if action == "carousel_submit":
        return "carousel_submit"
    if action == "video_form":
        return "video_form"
    if action == "video_submit":
        return "video_submit"
    if decision == "tune":
        return "tune"
    if decision == "rejected":
        return "rejected"
    if decision == "deleted":
        return "deleted"
    if decision == "approved" and first_value(payload, "production_content_type"):
        return "approve_with_config"
    if decision == "approved":
        return "approve_quick"
    return "unknown"


def resolve_tri_state(candidate_value: str, profile_flag: Any) -> str:
    value = (candidate_value or "").strip()
    if value == "Yes":
        return "Yes"
    if value == "No":
        return "No"
    return "Yes" if profile_flag is True else "No"


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None or value == "":
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


def default_slide_count(payload: dict[str, Any]) -> int:
    return parse_int(payload.get("carousel_slide_count"), DEFAULT_CAROUSEL_SLIDE_COUNT) or DEFAULT_CAROUSEL_SLIDE_COUNT
