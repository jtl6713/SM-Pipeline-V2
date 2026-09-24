from __future__ import annotations

import json
from typing import Any

from render.fields import field, field_str, parse_json_field
from t1.constants import DEFAULT_RULES, VIDEO_RULES
from t1.slice import clips_have_video, expand_to_timeline

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


def analysis_window(output: dict[str, Any], *, vo_end_override: float | None = None) -> tuple[float, float]:
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
    vo_end = vo_end_override if vo_end_override else voiceover_end_seconds(output)
    if vo_end:
        duration_f = max(duration_f, vo_end + voiceover_tail_seconds(output))
    owner = None
    for name in ("Studio_Effective_Video_Duration_Seconds", "Video_Duration_Seconds"):
        owner = _as_seconds(field(output, name))
        if owner and owner > 0:
            break
        owner = None
    if owner:
        duration_f = min(duration_f, max(0.25, owner))
    return start_f, duration_f


def resolve_rules(
    output: dict[str, Any],
    default_rules: dict[str, Any] | None = None,
    *,
    has_video: bool = False,
) -> dict[str, Any]:
    parsed = parse_json_field(field(output, "Timing_Rules_JSON"))
    if isinstance(parsed, dict) and str(parsed.get("strategy") or "").strip().lower() in {"vo_phased", "spread", "beat_fill"}:
        # Old phased/recycle plans made stills and clips different lengths.
        parsed = {
            key: parsed[key]
            for key in ("recycle", "max_clips", "post_voiceover_transition_frames")
            if key in parsed
        }
    base = VIDEO_RULES if has_video else (default_rules or DEFAULT_RULES)
    if has_video and default_rules and str((default_rules or {}).get("strategy") or "") not in {"", "equal_beats", "vo_phased"}:
        base = default_rules
    elif has_video:
        base = VIDEO_RULES
    legacy_default = {"rules": [{"remaining": True, "every_n_beats": 2}]}
    if parsed == legacy_default:
        return base
    if isinstance(parsed, dict) and parsed.get("rules") and str(parsed.get("strategy") or "").strip().lower() not in {"", "equal_beats"}:
        return parsed
    if isinstance(parsed, dict) and (parsed.get("recycle") is not None or parsed.get("strategy") or parsed.get("max_clips")):
        return {**base, **parsed, "strategy": "equal_beats"}
    return base


def apply_timeline(clips: list[dict[str, Any]], timeline: dict[str, Any]) -> list[dict[str, Any]]:
    if clips_have_video(clips):
        return expand_to_timeline(clips, timeline)
    plan = timeline.get("timeline") or timeline
    plan_clips = plan.get("clips") or []
    start = 0
    updated: list[dict[str, Any]] = []
    cycling = bool(plan_clips) and len(plan_clips) > len(clips)
    slot_count = len(plan_clips) if cycling else len(clips)
    for index in range(slot_count):
        source = clips[index % len(clips)] if clips else {}
        item = dict(source)
        plan_clip = plan_clips[index] if index < len(plan_clips) else {}
        frames = int(plan_clip.get("duration_frames") or item.get("durationFrames") or 1)
        item["startFrame"] = start
        item["durationFrames"] = max(1, frames)
        existing = item.get("transition") if isinstance(item.get("transition"), dict) else {}
        planned = plan_clip.get("transition") if isinstance(plan_clip.get("transition"), dict) else {}
        if existing or planned:
            merged = dict(planned)
            if existing.get("type"):
                merged["type"] = existing["type"]
            if not (merged.get("durationFrames") or merged.get("duration_frames")) and (
                existing.get("durationFrames") or existing.get("duration_frames")
            ):
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


def snap_timeline_to_beats(
    response: dict[str, Any],
    *,
    clip_count: int,
    fps: int = 30,
    requested_duration: float | None = None,
) -> dict[str, Any]:
    """Rebuild equal-beat clip boundaries on actual detected beats.

    The timing service can return beat metadata whose suggested boundaries are correct
    while the clip durations remain equal to the first interval. This post-pass keeps
    the requested overall duration but moves each transition onto a nearby strong beat.
    """
    if clip_count <= 1 or not isinstance(response, dict):
        return response
    beats_raw = response.get("beats_in_window") or response.get("beats") or []
    if not isinstance(beats_raw, list) or not beats_raw:
        return response
    strengths_raw = response.get("beat_strengths") or []
    window = response.get("window") if isinstance(response.get("window"), dict) else {}
    try:
        window_start = float(window.get("start_seconds") or 0)
    except (TypeError, ValueError):
        window_start = 0.0
    beats: list[tuple[float, float]] = []
    for index, raw in enumerate(beats_raw):
        try:
            beat = float(raw) - window_start
        except (TypeError, ValueError):
            continue
        if beat <= 0:
            continue
        try:
            strength = float(strengths_raw[index]) if index < len(strengths_raw) else 0.0
        except (TypeError, ValueError):
            strength = 0.0
        beats.append((beat, max(0.0, min(1.0, strength))))
    if len(beats) < clip_count - 1:
        return response

    timeline = response.get("timeline") if isinstance(response.get("timeline"), dict) else response
    plan_clips = timeline.get("clips") if isinstance(timeline.get("clips"), list) else []
    if not plan_clips:
        return response
    try:
        end = float(requested_duration or timeline.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        end = 0.0
    if end <= 0:
        end = max(beat for beat, _strength in beats)
    if end <= 0:
        return response

    available = [(beat, strength) for beat, strength in beats if 0 < beat < end]
    if len(available) < clip_count - 1:
        return response

    min_gap = max(0.35, end / max(clip_count * 4, 1))
    boundaries = [0.0]
    selected: list[float] = []
    for index in range(1, clip_count):
        ideal = end * index / clip_count
        remaining = clip_count - index - 1
        latest = end - (remaining + 1) * min_gap
        prior = boundaries[-1]
        candidates = [
            (beat, strength)
            for beat, strength in available
            if beat > prior + min_gap and beat < latest + 1e-6
        ]
        if not candidates:
            return response
        # Prefer proximity to the evenly spaced target, then favor a stronger beat.
        beat, _strength = min(
            candidates,
            key=lambda item: (
                abs(item[0] - ideal) - (0.35 * item[1]),
                abs(item[0] - ideal),
            ),
        )
        boundaries.append(beat)
        selected.append(beat)
    boundaries.append(end)

    frame_bounds = [0]
    for value in boundaries[1:]:
        frame = max(frame_bounds[-1] + 1, int(round(value * max(1, fps))))
        frame_bounds.append(frame)
    rebuilt: list[dict[str, Any]] = []
    transitions: list[dict[str, Any]] = []
    for index in range(clip_count):
        original = plan_clips[index] if index < len(plan_clips) and isinstance(plan_clips[index], dict) else {}
        start_frame = frame_bounds[index]
        end_frame = frame_bounds[index + 1]
        duration_frames = max(1, end_frame - start_frame)
        item = dict(original)
        item.update({
            "index": index,
            "start_frame": start_frame,
            "start_seconds": round(start_frame / max(1, fps), 4),
            "duration_frames": duration_frames,
            "duration_seconds": round(duration_frames / max(1, fps), 4),
        })
        if index > 0:
            transition = item.get("transition") if isinstance(item.get("transition"), dict) else {"type": "fade", "duration_frames": 2}
            transition = dict(transition)
            # A long dissolve masks the beat. Keep beat-snapped changes crisp.
            transition["duration_frames"] = min(6, max(2, int(transition.get("duration_frames") or transition.get("durationFrames") or 2)))
            item["transition"] = transition
            transitions.append({
                "at_seconds": round(start_frame / max(1, fps), 4),
                "type": str(transition.get("type") or "fade"),
                "duration_frames": transition["duration_frames"],
            })
        rebuilt.append(item)

    timeline["clips"] = rebuilt
    timeline["transitions"] = transitions
    timeline["duration_frames"] = frame_bounds[-1]
    timeline["duration_seconds"] = round(frame_bounds[-1] / max(1, fps), 4)
    metadata = timeline.get("metadata") if isinstance(timeline.get("metadata"), dict) else {}
    metadata = dict(metadata)
    metadata["beat_snap_v2"] = {
        "enabled": True,
        "selected_transition_seconds": [round(value, 4) for value in selected],
        "requested_duration_seconds": round(end, 4),
        "strategy": "strong_near_even",
    }
    timeline["metadata"] = metadata
    if timeline is not response:
        response["timeline"] = timeline
    response_meta = response.get("metadata") if isinstance(response.get("metadata"), dict) else {}
    response_meta = dict(response_meta)
    response_meta["beat_snap_v2"] = metadata["beat_snap_v2"]
    response["metadata"] = response_meta
    return response
