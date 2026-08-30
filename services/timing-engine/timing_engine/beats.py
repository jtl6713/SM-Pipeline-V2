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
        return [
            TimingEvent(kind="beat", time_seconds=time, strength=1.0)
            for time in analysis["beats_in_window"]
        ]


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
    tempo, beat_times = librosa.beat.beat_track(y=y, sr=sample_rate, units="time")
    if isinstance(tempo, np.ndarray):
        bpm = float(np.median(tempo)) if tempo.size else 0.0
    else:
        bpm = float(tempo)
    window_beats = [round(float(t), 4) for t in np.atleast_1d(beat_times) if float(t) >= 0]
    absolute = [round(start + t, 4) for t in window_beats]
    return {
        "bpm": round(bpm, 2),
        "beats": absolute,
        "beats_in_window": window_beats,
        "window": {"start_seconds": start, "duration_seconds": duration},
        "metadata": {
            "sr": int(sample_rate),
            "hop_length": 512,
            "samples": int(y.size),
            "librosa": getattr(librosa, "__version__", ""),
        },
    }
