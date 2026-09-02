from __future__ import annotations

from typing import Any

import numpy as np

from timing_engine.sources import TimingContext, TimingEvent


class BeatsSource:
    name = "beats"

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        analysis = analyze_beats(
            ctx.audio_path,
            music_start_seconds=ctx.music_start_seconds,
            music_duration_seconds=ctx.music_duration_seconds,
        )
        strengths = analysis.get("beat_strengths") or []
        events: list[TimingEvent] = []
        for index, time in enumerate(analysis["beats_in_window"]):
            strength = float(strengths[index]) if index < len(strengths) else 1.0
            events.append(TimingEvent(kind="beat", time_seconds=time, strength=strength))
        return events


def analyze_beats(
    audio_path: str,
    *,
    music_start_seconds: float,
    music_duration_seconds: float,
    sr: int = 22050,
) -> dict[str, Any]:
    import librosa

    start = max(0.0, float(music_start_seconds))
    duration = max(0.25, float(music_duration_seconds))
    y, sample_rate = librosa.load(audio_path, sr=sr, offset=start, duration=duration, mono=True)
    onset_env = librosa.onset.onset_strength(y=y, sr=sample_rate)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env,
        sr=sample_rate,
        units="frames",
    )
    if isinstance(tempo, np.ndarray):
        bpm = float(np.median(tempo)) if tempo.size else 0.0
    else:
        bpm = float(tempo)
    frames = np.atleast_1d(beat_frames)
    beat_times = librosa.frames_to_time(frames, sr=sample_rate)
    window_beats: list[float] = []
    strengths: list[float] = []
    env_size = int(np.asarray(onset_env).size)
    for frame, time in zip(frames, np.atleast_1d(beat_times)):
        if float(time) < 0:
            continue
        window_beats.append(round(float(time), 4))
        index = int(frame)
        if 0 <= index < env_size:
            strengths.append(float(onset_env[index]))
        else:
            strengths.append(1.0)
    peak = max(strengths) if strengths else 1.0
    if peak > 0:
        strengths = [round(value / peak, 4) for value in strengths]
    absolute = [round(start + time, 4) for time in window_beats]
    return {
        "bpm": round(bpm, 2),
        "beats": absolute,
        "beats_in_window": window_beats,
        "beat_strengths": strengths,
        "window": {"start_seconds": start, "duration_seconds": duration},
        "metadata": {
            "sr": int(sample_rate),
            "hop_length": 512,
            "samples": int(y.size),
            "librosa": getattr(librosa, "__version__", ""),
        },
    }
