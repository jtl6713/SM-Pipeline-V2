"""Timed-script per-scene voiceover synthesis helpers."""

from __future__ import annotations

from typing import Any, Callable

from audio.concat_mp3 import concat_mp3_bytes
from audio.voiceover_duration import probe_audio_duration_bytes
from studio_produce.timed_script import apply_measured_durations


SynthesizeFn = Callable[..., bytes]


def synthesize_timed_script_voiceover(
    timeline: dict[str, Any],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
) -> tuple[bytes, dict[str, Any], list[float]]:
    """Generate one ElevenLabs file per scene, measure each, concat for Remotion.

    Speaks each scene at rate 1.0 so still durations can follow the measured MP3
    lengths instead of imported clock estimates / 150 WPM guesses.
    """
    segments = [segment for segment in timeline.get("segments") or [] if isinstance(segment, dict)]
    if not segments:
        raise RuntimeError("timed-script timeline has no scenes")

    parts: list[bytes] = []
    measured: list[float] = []
    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("voiceover_text") or "").strip()
        if not text:
            raise RuntimeError(f"timed-script scene {index} has empty voiceover text")
        raw = synthesize(text, voice_id=voice_id, speed=1.0)
        if not raw:
            raise RuntimeError(f"timed-script scene {index} returned empty audio")
        seconds = probe_audio_duration_bytes(raw)
        if seconds <= 0:
            raise RuntimeError(f"timed-script scene {index} measured duration was {seconds}")
        parts.append(raw)
        measured.append(float(seconds))

    measured_timeline = apply_measured_durations(timeline, measured)
    if not measured_timeline:
        raise RuntimeError("failed to rebuild timed-script windows from measured durations")
    return concat_mp3_bytes(parts), measured_timeline, measured
