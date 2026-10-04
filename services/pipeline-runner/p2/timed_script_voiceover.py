"""Timed-script per-scene voiceover synthesis helpers."""

from __future__ import annotations

from typing import Any, Callable

from audio.concat_mp3 import concat_mp3_bytes
from audio.voiceover_duration import (
    DURATION_EPSILON_SECONDS,
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
    probe_audio_duration_bytes,
)
from studio_produce.timed_script import apply_measured_durations, normalize_timeline


SynthesizeFn = Callable[..., bytes]


def synthesize_timed_script_voiceover(
    timeline: dict[str, Any],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
    lengthen=None,
) -> tuple[bytes, dict[str, Any], list[float]]:
    """Generate one ElevenLabs file per scene, measure each, rewrite windows, concat.

    Import ``duration_seconds`` values are ordering/split hints only. Spoken MP3
    length owns each still: scene N narration plays while slide N shows, for
    exactly as long as that scene's TTS lasts. Do not pad or atempo-fit audio
    into the imported clocks.
    """
    normalized = normalize_timeline(timeline)
    if not normalized:
        raise RuntimeError("timed-script timeline is invalid")
    segments = [segment for segment in normalized.get("segments") or [] if isinstance(segment, dict)]
    if not segments:
        raise RuntimeError("timed-script timeline has no scenes")

    parts: list[bytes] = []
    measured: list[float] = []
    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("voiceover_text") or "").strip()
        if not text:
            raise RuntimeError(f"timed-script scene {index} has empty voiceover text")
        # Natural rate. Import windows must not drive speech_rate / atempo.
        raw = synthesize(text, voice_id=voice_id, speed=1.0)
        if not raw:
            raise RuntimeError(f"timed-script scene {index} returned empty audio")
        seconds = probe_audio_duration_bytes(raw)
        if seconds <= 0:
            raise RuntimeError(f"timed-script scene {index} measured duration was {seconds}")
        parts.append(raw)
        measured.append(float(seconds))

    parts, measured = _enforce_spoken_minimum(
        segments,
        parts,
        measured,
        voice_id=voice_id,
        synthesize=synthesize,
        lengthen=lengthen,
    )
    measured_timeline = apply_measured_durations(normalized, measured)
    if not measured_timeline:
        raise RuntimeError("failed to rebuild timed-script windows from measured durations")
    return concat_mp3_bytes(parts), measured_timeline, measured


def _enforce_spoken_minimum(
    segments: list[dict[str, Any]],
    parts: list[bytes],
    measured: list[float],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
    lengthen=None,
    attempts: int = 3,
) -> tuple[list[bytes], list[float]]:
    """Lengthen the last scene until the spoken track is at least 4 seconds."""
    if lengthen is None:
        from p2.voiceover_floor import lengthen_voiceover_script

        lengthen = lengthen_voiceover_script
    tries = max(1, int(attempts))
    for _attempt in range(tries):
        total = sum(measured)
        if total + DURATION_EPSILON_SECONDS >= MIN_VOICEOVER_SECONDS:
            return parts, measured
        last_text = str(segments[-1].get("voiceover_text") or "").strip()
        rewritten = str(lengthen(last_text, measured_seconds=total) or "").strip()
        if not rewritten:
            break
        segments[-1]["voiceover_text"] = rewritten
        raw = synthesize(rewritten, voice_id=voice_id, speed=1.0)
        if not raw:
            raise VoiceoverTooShort(
                "Voiceover rewrite returned empty audio. Spoken audio must be at least "
                f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
            )
        seconds = probe_audio_duration_bytes(raw)
        if seconds <= 0:
            raise VoiceoverTooShort(
                f"Voiceover rewrite measured {seconds}s. Spoken audio must be at least "
                f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
            )
        parts[-1] = raw
        measured[-1] = float(seconds)
    total = sum(measured)
    if total + DURATION_EPSILON_SECONDS < MIN_VOICEOVER_SECONDS:
        raise VoiceoverTooShort(
            f"Voiceover is {total:.3f}s. Spoken audio must be at least "
            f"{MIN_VOICEOVER_SECONDS:.0f} seconds. Not saved."
        )
    return parts, measured
