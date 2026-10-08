"""Timed-script per-scene voiceover synthesis helpers."""

from __future__ import annotations

import logging
from typing import Any, Callable

from audio.concat_mp3 import concat_mp3_bytes
from audio.silence_mp3 import silence_mp3_bytes
from audio.speech_activity import (
    MIN_MAX_VOLUME_DB,
    QUIET_TTS_ATTEMPTS,
    is_quiet_speech,
    probe_max_volume_db,
)
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

logger = logging.getLogger(__name__)


SynthesizeFn = Callable[..., bytes]
NormalizeSegmentFn = Callable[[bytes, int, str], bytes]
QuietSpeechFn = Callable[[bytes], bool]
ProbeMaxVolumeFn = Callable[[bytes], float | None]


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


def _synthesize_spoken_scene(
    text: str,
    *,
    voice_id: str,
    scene_index: int,
    synthesize: SynthesizeFn,
    is_quiet: QuietSpeechFn,
    probe_volume: ProbeMaxVolumeFn,
    max_attempts: int = QUIET_TTS_ATTEMPTS,
) -> bytes:
    """TTS a spoken scene; retry when ElevenLabs returns near-silence.

    Keep the loudest attempt when every try stays under the speech floor so
    production still advances and the per-scene loudnorm pass can salvage it.
    """
    attempts = max(1, int(max_attempts or 1))
    best: bytes | None = None
    best_volume = float("-inf")
    for attempt in range(1, attempts + 1):
        raw = synthesize(text, voice_id=voice_id, speed=1.0)
        if not raw:
            raise RuntimeError(f"timed-script scene {scene_index} returned empty audio")
        volume = probe_volume(raw)
        if volume is not None and volume > best_volume:
            best = raw
            best_volume = volume
        elif best is None:
            best = raw
        if not is_quiet(raw):
            if attempt > 1:
                logger.info(
                    "timed-script scene %s speech activity recovered on TTS attempt %s (max_volume=%s dB)",
                    scene_index,
                    attempt,
                    f"{volume:.1f}" if volume is not None else "n/a",
                )
            return raw
        logger.warning(
            "timed-script scene %s TTS attempt %s/%s below speech floor "
            "(max_volume=%s dB, floor=%s dB)",
            scene_index,
            attempt,
            attempts,
            f"{volume:.1f}" if volume is not None else "n/a",
            MIN_MAX_VOLUME_DB,
        )
    assert best is not None
    return best


def synthesize_timed_script_voiceover(
    timeline: dict[str, Any],
    *,
    voice_id: str,
    synthesize: SynthesizeFn,
    lengthen=None,
    normalize_segment: NormalizeSegmentFn | None = None,
    is_quiet_segment: QuietSpeechFn | None = None,
    probe_segment_volume: ProbeMaxVolumeFn | None = None,
    quiet_tts_attempts: int = QUIET_TTS_ATTEMPTS,
) -> tuple[bytes, dict[str, Any], list[float]]:
    """Generate one file per scene, measure each, rewrite windows, concat.

    Spoken scenes last as long as their TTS file. Silent scenes keep the
    writer's hold and are not sent to TTS. Import clocks are not targets.
    A short read is rejected. The words are not rewritten to hit 4, 15, or 30s.
    Near-silent TTS scenes are retried before loudness normalization.
    """
    del lengthen  # Kept so older callers still import. Lengthening is no longer used.
    normalized = normalize_timeline(timeline)
    if not normalized:
        raise RuntimeError("timed-script timeline is invalid")
    segments = [segment for segment in normalized.get("segments") or [] if isinstance(segment, dict)]
    if not segments:
        raise RuntimeError("timed-script timeline has no scenes")

    quiet_check = is_quiet_segment or is_quiet_speech
    volume_probe = probe_segment_volume or probe_max_volume_db

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
        raw = _synthesize_spoken_scene(
            text,
            voice_id=voice_id,
            scene_index=index,
            synthesize=synthesize,
            is_quiet=quiet_check,
            probe_volume=volume_probe,
            max_attempts=quiet_tts_attempts,
        )

        # ElevenLabs scene calls can differ dramatically in output level even
        # when the voice and settings are identical. Normalizing only after
        # concatenation preserves those relative differences, which produced
        # the recurring "voiceover nearly disappears for one or two scenes"
        # defect. Level every spoken scene before concat; the final whole-file
        # normalization still runs afterward as the delivery loudness pass.
        if normalize_segment is not None:
            leveled = normalize_segment(raw, index, text)
            if not leveled:
                raise RuntimeError(f"timed-script scene {index} normalization returned empty audio")
            raw = leveled

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
