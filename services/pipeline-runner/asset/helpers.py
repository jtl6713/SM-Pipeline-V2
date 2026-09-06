from __future__ import annotations

from typing import Any


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off", ""}:
        return False
    return default


def parse_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def parse_bytes(value: Any) -> int:
    return parse_int(value, 0) or 0


def drive_video_duration_seconds(file: dict[str, Any] | None) -> int | None:
    metadata = (file or {}).get("videoMediaMetadata") or {}
    try:
        millis = float(metadata.get("durationMillis") or 0)
    except (TypeError, ValueError):
        return None
    if millis <= 0:
        return None
    return max(1, int(round(millis / 1000.0)))


def uc_download_url(file_id: str) -> str:
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def join_list(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "").strip()


def contains_any(haystack: str, needles: tuple[str, ...] | list[str], *, casefold: bool = True) -> bool:
    text = haystack.casefold() if casefold else haystack
    for needle in needles:
        probe = needle.casefold() if casefold else needle
        if probe and probe in text:
            return True
    return False
