import wave
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from app import app


def _click_track(path: Path, seconds: float = 4.0, bpm: float = 120.0) -> None:
    sr = 22050
    total = int(sr * seconds)
    audio = np.zeros(total, dtype=np.float32)
    interval = 60.0 / bpm
    beat = 0.0
    while beat < seconds:
        index = int(beat * sr)
        end = min(total, index + 200)
        audio[index:end] = 0.9
        beat += interval
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(pcm.tobytes())


def test_health():
    client = TestClient(app)
    payload = client.get("/health").json()
    assert payload["ok"] is True
    assert payload["port"] == 3336


def test_timeline_from_local_click_track(tmp_path):
    audio = tmp_path / "clicks.wav"
    _click_track(audio)
    client = TestClient(app)
    response = client.post("/timeline", json={
        "music_path": str(audio),
        "music_start_seconds": 0,
        "music_duration_seconds": 4,
        "clip_count": 4,
        "fps": 30,
        "transition_rules": {"rules": [{"remaining": True, "every_n_beats": 1}]},
        "cleanup": False,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["bpm"] > 0
    assert len(body["beats_in_window"]) >= 3
    assert len(body["timeline"]["clips"]) == 4
    assert sum(clip["duration_frames"] for clip in body["timeline"]["clips"]) == body["timeline"]["duration_frames"]
