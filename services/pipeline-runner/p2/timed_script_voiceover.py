"""Timed-script per-scene voiceover synthesis helpers."""

from __future__ import annotations

from typing import Any, Callable

from audio.concat_mp3 import concat_mp3_bytes
from audio.silence_mp3 import silence_mp3_bytes
from audio.voiceover_duration import (
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
    probe_audio_duration_bytes,
)
from studio_produce.timed_script import (
    DEFAULT_SILENT_HOLD_SECONDS,
    MIN_SCENE_SECONDS,
    apply_measured_durations,
    normalize_timeline,
)


SynthesizeFn = Callable[..., bytes]


def _silent_segment(segment: dict[str, Any]) -> bool:
    if segment.get("silent") is True:
        return True
    return not str(segment.get("voiceover_text") or "").strip()


def _hold_seconds(segment: dict[str, Any]) -> float:
    for key in ("hold_seconds", "duration_seconds"):
        try:
            value = float(segment.get(key) or 0)
        except (TypeError, ValueError):
            value = 0.0
        if value > 0:
            return max(MIN_SCENE_SECONDS, value)
    return DEFAULT_SILENT_HOLD_SECONDS


def synthesize_timed_script_voiceover(
    timeline: dict[str, Any],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
    lengthen=None,
) -> tuple[bytes, dict[str, Any], list[float]]:
    """Generate one file per scene, measure each, rewrite windows, concat.

    Spoken scenes last as long as their TTS file. Silent scenes keep the
    writer's hold and are not sent to TTS. Import clocks are not targets.
    A short read is rejected. The words are not rewritten to hit 4, 15, or 30s.
    """
    del lengthen  # Kept so older callers still import. Lengthening is no longer used.
    normalized = normalize_timeline(timeline)
    if not normalized:
        raise RuntimeError("timed-script timeline is invalid")
    segments = [segment for segment in normalized.get("segments") or [] if isinstance(segment, dict)]
    if not segments:
        raise RuntimeError("timed-script timeline has no scenes")

    parts: list[bytes] = []
    measured: list[float] = []
    spoken_seconds = 0.0
    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("voiceover_text") or "").strip()
        if _silent_segment(segment):
            hold = _hold_seconds(segment)
            raw = silence_mp3_bytes(hold)
            seconds = probe_audio_duration_bytes(raw)
            if seconds <= 0:
                seconds = hold
            parts.append(raw)
            measured.append(float(seconds))
            continue
        raw = synthesize(text, voice_id=voice_id, speed=1.0)
        if not raw:
            raise RuntimeError(f"timed-script scene {index} returned empty audio")
        seconds = probe_audio_duration_bytes(raw)
        if seconds <= 0:
            raise RuntimeError(f"timed-script scene {index} measured duration was {seconds}")
        parts.append(raw)
        measured.append(float(seconds))
        spoken_seconds += float(seconds)

    if spoken_seconds + 1e-9 < MIN_VOICEOVER_SECONDS:
        raise VoiceoverTooShort(
            f"Voiceover is {spoken_seconds:.3f}s. Spoken audio must be at least "
            f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    measured_timeline = apply_measured_durations(normalized, measured)
    if not measured_timeline:
        raise RuntimeError("failed to rebuild timed-script windows from measured durations")
    if normalized.get("source"):
        measured_timeline["source"] = normalized.get("source")
    return concat_mp3_bytes(parts), measured_timeline, measured
