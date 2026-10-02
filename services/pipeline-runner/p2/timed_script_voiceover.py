"""Timed-script per-scene voiceover synthesis helpers."""

from __future__ import annotations

from typing import Any, Callable

from audio.concat_mp3 import concat_mp3_bytes
from audio.fit_duration import fit_mp3_to_duration_bytes
from studio_produce.timed_script import (
    MAX_SPEECH_RATE,
    MIN_SPEECH_RATE,
    normalize_timeline,
)


SynthesizeFn = Callable[..., bytes]


def _scene_speech_rate(segment: dict[str, Any]) -> float:
    try:
        rate = float(segment.get("speech_rate") or 1.0)
    except (TypeError, ValueError):
        rate = 1.0
    if rate <= 0:
        rate = 1.0
    return min(MAX_SPEECH_RATE, max(MIN_SPEECH_RATE, rate))


def synthesize_timed_script_voiceover(
    timeline: dict[str, Any],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
) -> tuple[bytes, dict[str, Any], list[float]]:
    """Generate one ElevenLabs file per scene, fit each to the imported window, concat.

    The imported timeline is the clock for both stills and narration. Scene N audio
    must occupy exactly ``duration_seconds`` so \"Before you go down the stairs\"
    starts at the same second as scene 3 on the import (NYC: 20s, not ~13s).
    """
    normalized = normalize_timeline(timeline)
    if not normalized:
        raise RuntimeError("timed-script timeline is invalid")
    segments = [segment for segment in normalized.get("segments") or [] if isinstance(segment, dict)]
    if not segments:
        raise RuntimeError("timed-script timeline has no scenes")

    parts: list[bytes] = []
    window_seconds: list[float] = []
    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("voiceover_text") or "").strip()
        if not text:
            raise RuntimeError(f"timed-script scene {index} has empty voiceover text")
        try:
            target = float(segment.get("duration_seconds") or 0)
        except (TypeError, ValueError):
            target = 0.0
        if target < 1.0:
            raise RuntimeError(f"timed-script scene {index} has invalid duration {target}")
        raw = synthesize(text, voice_id=voice_id, speed=_scene_speech_rate(segment))
        if not raw:
            raise RuntimeError(f"timed-script scene {index} returned empty audio")
        fitted = fit_mp3_to_duration_bytes(raw, target)
        parts.append(fitted)
        window_seconds.append(target)

    return concat_mp3_bytes(parts), normalized, window_seconds
