from __future__ import annotations

from typing import Any


VIDEO_EXTENSIONS = (".mp4", ".mov", ".m4v", ".webm")
DRIVE_DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={file_id}"


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


def _is_http_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def _is_studio_stream_path(value: str) -> bool:
    return str(value or "").strip().startswith("/api/media-assets/")


def drive_download_url(*records: dict[str, Any] | None) -> str:
    for record in records:
        if not isinstance(record, dict):
            continue
        drive_id = str(record.get("google_drive_file_id") or record.get("googleDriveFileId") or "").strip()
        if drive_id:
            return DRIVE_DOWNLOAD_URL.format(file_id=drive_id)
    return ""


def playable_url(asset: dict[str, Any] | None) -> str:
    item = asset or {}
    if asset_is_video(item):
        for key in ("google_drive_url", "url", "src"):
            value = str(item.get(key) or "").strip()
            if _is_http_url(value):
                return value
    for key in ("preview_url", "url", "src", "google_drive_url"):
        value = str(item.get(key) or "").strip()
        if _is_http_url(value):
            return value
    return ""


def remotion_clip_url(master: dict[str, Any] | None, variant: dict[str, Any] | None = None) -> str:
    """Absolute fetch URL for Remotion. Never a Studio /api/media-assets stream path."""
    merged = {**(master or {}), **(variant or {})}
    url = playable_url(merged)
    if _is_http_url(url) and not _is_studio_stream_path(url):
        return url
    variant_url = str((variant or {}).get("preview_url") or "").strip()
    if _is_http_url(variant_url) and not _is_studio_stream_path(variant_url):
        return variant_url
    return drive_download_url(master, variant, merged)


def clip_in_out_seconds(asset: dict[str, Any] | None, *, default_duration: float = 5.0) -> tuple[float, float]:
    item = asset or {}
    duration = _positive_float(item.get("duration_seconds") or item.get("durationSeconds"), default_duration)
    start = max(0.0, _positive_float(item.get("in_seconds") or item.get("inSeconds") or item.get("startFromSeconds"), 0.0))
    end = _positive_float(item.get("out_seconds") or item.get("outSeconds"), 0.0)
    if end <= start:
        end = start + duration
    return start, max(start + 0.2, end)


def source_duration_seconds(asset: dict[str, Any] | None, *, default_duration: float = 5.0) -> float:
    item = asset or {}
    for key in (
        "sourceDurationSeconds",
        "source_duration_seconds",
        "duration_seconds",
        "durationSeconds",
    ):
        value = _positive_float(item.get(key), 0.0)
        if value > 0:
            return value
    if asset_is_video(item):
        frames = item.get("durationFrames") or item.get("duration_frames")
        try:
            frame_seconds = float(frames or 0) / 30.0
        except (TypeError, ValueError):
            frame_seconds = 0.0
        if frame_seconds > 0:
            return frame_seconds
    start, end = clip_in_out_seconds(item, default_duration=default_duration)
    return max(end, default_duration)


def distribute_frames(weights: list[int], budget: int, *, minimum: int = 1) -> list[int]:
    count = len(weights)
    if count == 0:
        return []
    floor = max(1, int(minimum))
    if budget <= count * floor:
        return [floor] * count
    leftover = budget - (count * floor)
    positive = [max(1, int(weight)) for weight in weights]
    total = sum(positive)
    raw = [leftover * weight / total for weight in positive]
    extras = [int(value) for value in raw]
    remainder = leftover - sum(extras)
    order = sorted(
        range(count),
        key=lambda index: raw[index] - extras[index],
        reverse=True,
    )
    for index in order[:remainder]:
        extras[index] += 1
    return [floor + extras[index] for index in range(count)]


def _positive_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number > 0 else fallback
