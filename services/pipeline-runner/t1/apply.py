from __future__ import annotations

import json
from typing import Any

from render.fields import field, field_str, parse_json_field
from t1.constants import DEFAULT_RULES

DEFAULT_VOICEOVER_TAIL_SECONDS = 2.0


def music_url(output: dict[str, Any]) -> str:
    return field_str(output, "Music_URL") or field_str(output, "Selected_Music_URL") or field_str(output, "Preferred_Music_URL")


def music_is_enabled(output: dict[str, Any]) -> bool:
    mode = field_str(output, "Studio_Effective_Background_Music_Mode").strip().lower()
    if mode in {"no", "false", "0"}:
        return False
    return bool(music_url(output))


def clip_list(output: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(output, list):
        return [item for item in output if isinstance(item, dict)]
    parsed = parse_json_field(field(output, "Render_Clip_List_JSON"))
    return parsed if isinstance(parsed, list) else []


def _as_seconds(value: Any, default: float | None = None) -> float | None:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def voiceover_end_seconds(output: dict[str, Any]) -> float | None:
    for name in (
        "Studio_Effective_Voiceover_Duration_Seconds",
        "Voiceover_Duration_Seconds",
    ):
        value = _as_seconds(field(output, name))
        if value and value > 0:
            return value
    return None


def voiceover_tail_seconds(output: dict[str, Any]) -> float:
    for name in (
        "Studio_Effective_Voiceover_Tail_Seconds",
        "Voiceover_Tail_Seconds",
    ):
        value = _as_seconds(field(output, name))
        if value is not None:
            return max(0.0, value)
    return DEFAULT_VOICEOVER_TAIL_SECONDS


def analysis_window(output: dict[str, Any]) -> tuple[float, float]:
    start = field(output, "Music_Start_Seconds")
    if start in (None, ""):
        start = field(output, "Studio_Effective_Music_Start_Seconds") or 0
    duration = field(output, "Music_Duration_Seconds")
    if duration in (None, ""):
        duration = field(output, "Studio_Effective_Video_Duration_Seconds")
    if duration in (None, ""):
        frames = field(output, "Render_Total_Frames") or 0
        try:
            duration = float(frames) / 30.0
        except (TypeError, ValueError):
            duration = 30
    try:
        start_f = max(0.0, float(start or 0))
    except (TypeError, ValueError):
        start_f = 0.0
    try:
        duration_f = max(0.25, float(duration or 0))
    except (TypeError, ValueError):
        duration_f = 30.0
    vo_end = voiceover_end_seconds(output)
    if vo_end:
        duration_f = max(duration_f, vo_end + voiceover_tail_seconds(output))
    return start_f, duration_f


def resolve_rules(output: dict[str, Any], default_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed = parse_json_field(field(output, "Timing_Rules_JSON"))
    base = default_rules or DEFAULT_RULES
    legacy_default = {"rules": [{"remaining": True, "every_n_beats": 2}]}
    if parsed == legacy_default:
        return base
    if isinstance(parsed, dict) and parsed.get("rules"):
        return parsed
    if isinstance(parsed, dict) and (parsed.get("recycle") is not None or parsed.get("strategy")):
        return {**base, **parsed}
    return base


def _clip_kind(clip: dict[str, Any]) -> str:
    return str(clip.get("media_kind") or clip.get("mediaKind") or "").strip().lower()


def _mixed_media_frames(
    clips: list[dict[str, Any]],
    plan_clips: list[dict[str, Any]],
    target_frames: int,
) -> list[int]:
    fixed = [
        max(1, int(clip.get("durationFrames") or clip.get("duration_frames") or 1))
        if _clip_kind(clip) == "video"
        else 0
        for clip in clips
    ]
    photo_indexes = [index for index, clip in enumerate(clips) if _clip_kind(clip) != "video"]
    if not photo_indexes:
        return fixed

    photo_budget = max(len(photo_indexes), target_frames - sum(fixed))
    weights = [
        max(
            1,
            int(
                (plan_clips[index] if index < len(plan_clips) else {}).get("duration_frames")
                or clips[index].get("durationFrames")
                or 1
            ),
        )
        for index in photo_indexes
    ]
    weight_total = sum(weights)
    distributable = photo_budget - len(photo_indexes)
    raw_extras = [distributable * weight / weight_total for weight in weights]
    extras = [int(value) for value in raw_extras]
    remainder = distributable - sum(extras)
    order = sorted(
        range(len(photo_indexes)),
        key=lambda index: raw_extras[index] - extras[index],
        reverse=True,
    )
    for index in order[:remainder]:
        extras[index] += 1
    for position, clip_index in enumerate(photo_indexes):
        fixed[clip_index] = 1 + extras[position]
    return fixed


def apply_timeline(clips: list[dict[str, Any]], timeline: dict[str, Any]) -> list[dict[str, Any]]:
    plan = timeline.get("timeline") or timeline
    plan_clips = plan.get("clips") or []
    start = 0
    updated: list[dict[str, Any]] = []
    cycling = bool(plan_clips) and len(plan_clips) > len(clips)
    slot_count = len(plan_clips) if cycling else len(clips)
    target_frames = int(plan.get("duration_frames") or sum(
        int(item.get("duration_frames") or 0) for item in plan_clips
    ))
    mixed = not cycling and any(_clip_kind(clip) == "video" for clip in clips)
    authored_frames = _mixed_media_frames(clips, plan_clips, target_frames) if mixed else []
    for index in range(slot_count):
        source = clips[index % len(clips)] if clips else {}
        item = dict(source)
        plan_clip = plan_clips[index] if index < len(plan_clips) else {}
        kind = _clip_kind(item)
        if mixed:
            frames = authored_frames[index]
        elif kind == "video" and not cycling:
            frames = int(item.get("durationFrames") or item.get("duration_frames") or 1)
        else:
            frames = int(plan_clip.get("duration_frames") or item.get("durationFrames") or 1)
        item["startFrame"] = start
        item["durationFrames"] = max(1, frames)
        existing = item.get("transition") if isinstance(item.get("transition"), dict) else {}
        planned = plan_clip.get("transition") if isinstance(plan_clip.get("transition"), dict) else {}
        if existing or planned:
            merged = dict(planned)
            if existing.get("type"):
                merged["type"] = existing["type"]
            if existing.get("durationFrames") or existing.get("duration_frames"):
                merged["duration_frames"] = existing.get("durationFrames") or existing.get("duration_frames")
            if merged.get("duration_frames") and "durationFrames" not in merged:
                merged["durationFrames"] = merged["duration_frames"]
            elif merged.get("durationFrames") and "duration_frames" not in merged:
                merged["duration_frames"] = merged["durationFrames"]
            if merged:
                item["transition"] = merged
        start = item["startFrame"] + item["durationFrames"]
        updated.append(item)
    return updated


def analysis_payload(response: dict[str, Any]) -> str:
    return json.dumps(
        {
            "bpm": response.get("bpm"),
            "beats": response.get("beats"),
            "beats_in_window": response.get("beats_in_window"),
            "beat_strengths": response.get("beat_strengths"),
            "window": response.get("window"),
            "metadata": response.get("metadata"),
        },
        separators=(",", ":"),
    )
