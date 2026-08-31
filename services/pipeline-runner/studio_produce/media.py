from __future__ import annotations

from typing import Any


VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm")


def asset_is_video(asset: dict[str, Any] | None) -> bool:
    item = asset or {}
    kind = str(item.get("media_kind") or item.get("mediaKind") or "").strip().lower()
    if kind == "video":
        return True
    if kind in {"photo", "image"}:
        return False
    mime = str(item.get("mime_type") or item.get("mimeType") or "").strip().lower()
    name = str(item.get("name") or item.get("asset_name") or item.get("file_name") or "").strip().lower()
    return mime.startswith("video/") or name.endswith(VIDEO_EXTENSIONS)


def asset_media_kind(asset: dict[str, Any] | None) -> str:
    return "video" if asset_is_video(asset) else "photo"


def playable_url(asset: dict[str, Any] | None) -> str:
    item = asset or {}
    for key in ("preview_url", "url", "src", "google_drive_url"):
        value = str(item.get(key) or "").strip()
        if value.startswith("http://") or value.startswith("https://"):
            return value
    return ""


def clip_in_out_seconds(asset: dict[str, Any] | None, *, default_duration: float = 5.0) -> tuple[float, float]:
    item = asset or {}
    duration = _positive_float(item.get("duration_seconds") or item.get("durationSeconds"), default_duration)
    start = max(0.0, _positive_float(item.get("in_seconds") or item.get("inSeconds") or item.get("startFromSeconds"), 0.0))
    end = _positive_float(item.get("out_seconds") or item.get("outSeconds"), 0.0)
    if end <= start:
        end = start + duration
    return start, max(start + 0.2, end)


def _positive_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number > 0 else fallback
