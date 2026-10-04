"""Measure voiceover audio and enforce video-duration caps."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from audio.leading_silence import _probe_duration
from render.fields import field, field_str, parse_json_field

DEFAULT_VOICEOVER_TAIL_SECONDS = 2.0
DURATION_EPSILON_SECONDS = 0.05
MIN_VOICEOVER_SECONDS = 4.0


def required_voiceover_seconds(measured: float | None) -> float:
    """Return the persisted VO length when a spoken track exists.

    Spoken audio shorter than ``MIN_VOICEOVER_SECONDS`` must be padded (trailing
    silence). Never slow speech to fill a planning target. Empty audio stays 0.
    """
    try:
        value = float(measured or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value <= 0:
        return 0.0
    return max(MIN_VOICEOVER_SECONDS, value)


def apply_min_voiceover_floor(
    segment_seconds: list[float] | None,
    total_seconds: float | None = None,
) -> list[float]:
    """Keep per-scene speech windows; put any 4s-floor remainder on the last still."""
    values = []
    for raw in segment_seconds or []:
        try:
            values.append(max(0.0, float(raw)))
        except (TypeError, ValueError):
            values.append(0.0)
    if not values:
        return values
    current = sum(values)
    try:
        target = float(total_seconds) if total_seconds is not None else current
    except (TypeError, ValueError):
        target = current
    floor = required_voiceover_seconds(target if target > 0 else current)
    gap = floor - sum(values)
    if gap > DURATION_EPSILON_SECONDS:
        values[-1] = values[-1] + gap
    return values


def probe_audio_duration_bytes(data: bytes) -> float:
    if not data:
        raise RuntimeError("empty audio payload")
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
        handle.write(data)
        path = Path(handle.name)
    try:
        return max(0.0, float(_probe_duration(path)))
    finally:
        path.unlink(missing_ok=True)


def probe_audio_duration_url(url: str) -> float:
    value = str(url or "").strip()
    if not value:
        raise RuntimeError("missing voiceover url")
    return max(0.0, float(_probe_duration(value)))


def _as_seconds(value: Any, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def voiceover_tail_seconds(*records: dict[str, Any] | None) -> float:
    for record in records:
        if not record:
            continue
        for name in ("Studio_Effective_Voiceover_Tail_Seconds", "Voiceover_Tail_Seconds"):
            value = _as_seconds(field(record, name))
            if value is not None:
                return max(0.0, value)
    return DEFAULT_VOICEOVER_TAIL_SECONDS


def owner_video_seconds(*records: dict[str, Any] | None) -> float | None:
    for record in records:
        if not record:
            continue
        for name in (
            "Studio_Effective_Video_Duration_Seconds",
            "Video_Duration_Seconds",
            "Content_Duration",
        ):
            value = _as_seconds(field(record, name))
            if value and value > 0:
                return value
    return None


def render_video_seconds(output: dict[str, Any]) -> float | None:
    timeline = parse_json_field(field(output, "Timing_Timeline_JSON"))
    if isinstance(timeline, dict):
        duration = _as_seconds(timeline.get("duration_seconds"))
        if duration and duration > 0:
            return duration
        frames = _as_seconds(timeline.get("duration_frames"))
        if frames and frames > 0:
            return frames / 30.0
    frames = _as_seconds(field(output, "Render_Total_Frames"))
    if frames and frames > 0:
        return frames / 30.0
    return None


def voiceover_is_disabled(
    output: dict[str, Any] | None = None,
    content_item: dict[str, Any] | None = None,
) -> bool:
    output_mode = field_str(output or {}, "Studio_Effective_Voiceover_Mode").strip().lower()
    if output_mode in {"no", "false", "0"}:
        return True
    if output_mode in {"yes", "true", "1"}:
        return False
    parent_mode = field_str(content_item or {}, "Include_Voiceover").strip().lower()
    return parent_mode in {"no", "false", "0"}


def voiceover_url(*records: dict[str, Any] | None) -> str:
    for record in records:
        if not record:
            continue
        url = field_str(record, "Voiceover_URL")
        if url:
            return url
    return ""


def measured_voiceover_seconds(
    output: dict[str, Any] | None = None,
    content_item: dict[str, Any] | None = None,
    *,
    url: str | None = None,
    probe: bool = True,
) -> float | None:
    records = (output, content_item)
    if voiceover_is_disabled(output, content_item):
        return None
    target_url = str(url or "").strip() or voiceover_url(*records)
    if probe and target_url:
        try:
            return probe_audio_duration_url(target_url)
        except Exception:
            pass
    for record in records:
        if not record:
            continue
        for name in (
            "Studio_Effective_Voiceover_Duration_Seconds",
            "Voiceover_Duration_Seconds",
        ):
            value = _as_seconds(field(record, name))
            if value and value > 0:
                return value
    return None


def voiceover_exceeds_video(
    *,
    voiceover_seconds: float,
    video_seconds: float,
    tail_seconds: float = 0.0,
) -> bool:
    cap = max(0.0, float(video_seconds))
    spoken = max(0.0, float(voiceover_seconds))
    tail = max(0.0, float(tail_seconds))
    if spoken > cap + DURATION_EPSILON_SECONDS:
        return True
    return spoken + tail > cap + DURATION_EPSILON_SECONDS


def voiceover_exceeds_video_message(
    *,
    voiceover_seconds: float,
    video_seconds: float,
    tail_seconds: float = 0.0,
    context: str = "video",
) -> str:
    return (
        f"Voiceover is {voiceover_seconds:.2f}s but {context} is {video_seconds:.2f}s "
        f"(tail {tail_seconds:.2f}s). Spoken audio must never run past the video end."
    )


def validate_voiceover_for_owner_cap(
    *,
    voiceover_seconds: float,
    content_item: dict[str, Any] | None,
    request: dict[str, Any] | None = None,
) -> str | None:
    video_cap = owner_video_seconds(content_item, request)
    if not video_cap:
        return None
    tail = voiceover_tail_seconds(content_item, request)
    if voiceover_exceeds_video(
        voiceover_seconds=voiceover_seconds,
        video_seconds=video_cap,
        tail_seconds=tail,
    ):
        return voiceover_exceeds_video_message(
            voiceover_seconds=voiceover_seconds,
            video_seconds=video_cap,
            tail_seconds=tail,
            context="requested video duration",
        )
    return None


def validate_voiceover_for_render(
    output: dict[str, Any],
    content_item: dict[str, Any] | None = None,
    *,
    probe: bool = True,
) -> str | None:
    if voiceover_is_disabled(output, content_item):
        return None
    url = voiceover_url(output, content_item)
    if not url:
        return None
    measured = measured_voiceover_seconds(output, content_item, url=url, probe=probe)
    if measured is None:
        return None
    video_seconds = render_video_seconds(output)
    if video_seconds is None:
        video_seconds = owner_video_seconds(output, content_item)
    if video_seconds is None:
        return None
    tail = voiceover_tail_seconds(output, content_item)
    if voiceover_exceeds_video(
        voiceover_seconds=measured,
        video_seconds=video_seconds,
        tail_seconds=tail,
    ):
        return voiceover_exceeds_video_message(
            voiceover_seconds=measured,
            video_seconds=video_seconds,
            tail_seconds=tail,
            context="render duration",
        )
    return None
