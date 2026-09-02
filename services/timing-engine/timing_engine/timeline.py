from __future__ import annotations

from typing import Any

from timing_engine.rules import DEFAULT_RULES, apply_rules
from timing_engine.sources import SOURCE_REGISTRY, TimingContext, TimingEvent

SCHEMA_VERSION = "timing.timeline.1"


def default_transition(raw: dict[str, Any] | None) -> dict[str, Any]:
    payload = raw or {}
    frames = int(payload.get("duration_frames") or payload.get("durationFrames") or 12)
    return {
        "type": str(payload.get("type") or "fade"),
        "duration_frames": max(1, frames),
    }


def _seconds_to_frames(values: list[float], fps: int, total_frames: int) -> list[int]:
    if not values:
        return []
    raw = [max(1, round(seconds * fps)) for seconds in values]
    delta = total_frames - sum(raw)
    raw[-1] = max(1, raw[-1] + delta)
    return raw


def build_timeline(
    *,
    beats_in_window: list[float],
    clip_count: int,
    duration_seconds: float,
    fps: int,
    rules: dict[str, Any] | None,
    transition: dict[str, Any] | None = None,
    extra_events: list[TimingEvent] | None = None,
    voiceover_end_seconds: float | None = None,
    beat_strengths: list[float] | None = None,
) -> dict[str, Any]:
    count = max(1, int(clip_count))
    fps_i = max(1, int(fps))
    duration = max(0.25, float(duration_seconds))
    transition_plan = default_transition(transition)
    post_voiceover_transition_frames = max(
        1,
        int((rules or {}).get("post_voiceover_transition_frames") or 2),
    )
    min_clip = (transition_plan["duration_frames"] + 1) / fps_i
    cuts, rule_meta = apply_rules(
        beats_in_window,
        count,
        duration,
        rules or DEFAULT_RULES,
        min_clip_seconds=min_clip,
        voiceover_end_seconds=voiceover_end_seconds,
        beat_strengths=beat_strengths,
    )
    planned = int(rule_meta.get("effective_clip_count") or count)
    count = max(1, planned)
    total_frames = max(count, round(duration * fps_i))
    boundaries = [0.0, *cuts, duration]
    clip_seconds = [
        max(min_clip, boundaries[index + 1] - boundaries[index])
        for index in range(count)
    ]
    clip_frames = _seconds_to_frames(clip_seconds, fps_i, total_frames)
    start_frame = 0
    clips: list[dict[str, Any]] = []
    transitions: list[dict[str, Any]] = []
    for index, frames in enumerate(clip_frames):
        start_seconds = start_frame / fps_i
        clip = {
            "index": index,
            "start_seconds": round(start_seconds, 4),
            "duration_seconds": round(frames / fps_i, 4),
            "duration_frames": frames,
            "start_frame": start_frame,
        }
        if index > 0:
            boundary_transition = dict(transition_plan)
            if voiceover_end_seconds is not None and start_seconds >= float(voiceover_end_seconds):
                boundary_transition["duration_frames"] = min(
                    boundary_transition["duration_frames"],
                    post_voiceover_transition_frames,
                )
            clip["transition"] = boundary_transition
            transitions.append({
                "at_seconds": round(start_seconds, 4),
                "type": boundary_transition["type"],
                "duration_frames": boundary_transition["duration_frames"],
            })
        clips.append(clip)
        start_frame += frames
    return {
        "schema_version": SCHEMA_VERSION,
        "fps": fps_i,
        "duration_seconds": round(total_frames / fps_i, 4),
        "duration_frames": total_frames,
        "clips": clips,
        "transitions": transitions,
        "metadata": {
            **rule_meta,
            "extra_event_kinds": sorted({event.kind for event in extra_events or []}),
            "available_sources": ["beats", *sorted(SOURCE_REGISTRY)],
        },
    }


def merge_sources(ctx: TimingContext, source_names: list[str]) -> tuple[list[TimingEvent], dict[str, Any]]:
    from timing_engine.beats import BeatsSource

    events: list[TimingEvent] = []
    used: list[str] = []
    for name in source_names or ["beats"]:
        key = str(name).strip().lower()
        if key == "beats":
            source = BeatsSource()
        elif key in SOURCE_REGISTRY:
            source = SOURCE_REGISTRY[key]()
        else:
            continue
        events.extend(source.analyze(ctx))
        used.append(key)
    return events, {"sources_used": used}
