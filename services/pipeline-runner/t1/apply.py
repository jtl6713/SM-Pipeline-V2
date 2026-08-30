from __future__ import annotations

import json
from typing import Any

from render.fields import field, field_str, parse_json_field
from t1.constants import DEFAULT_RULES


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
    return start_f, duration_f


def resolve_rules(output: dict[str, Any], default_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    parsed = parse_json_field(field(output, "Timing_Rules_JSON"))
    if isinstance(parsed, dict) and parsed.get("rules"):
        return parsed
    return default_rules or DEFAULT_RULES


def apply_timeline(clips: list[dict[str, Any]], timeline: dict[str, Any]) -> list[dict[str, Any]]:
    plan_clips = ((timeline.get("timeline") or timeline).get("clips") or [])
    start = 0
    updated: list[dict[str, Any]] = []
    for index, clip in enumerate(clips):
        item = dict(clip)
        plan = plan_clips[index] if index < len(plan_clips) else {}
        frames = int(plan.get("duration_frames") or item.get("durationFrames") or 1)
        item["startFrame"] = int(plan.get("start_frame") if plan.get("start_frame") is not None else start)
        item["durationFrames"] = max(1, frames)
        existing = item.get("transition") if isinstance(item.get("transition"), dict) else {}
        planned = plan.get("transition") if isinstance(plan.get("transition"), dict) else {}
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
            "window": response.get("window"),
            "metadata": response.get("metadata"),
        },
        separators=(",", ":"),
    )
