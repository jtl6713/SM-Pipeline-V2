"""Per-scene timed-script voiceover synthesis."""

from __future__ import annotations

from p2.timed_script_voiceover import synthesize_timed_script_voiceover
from studio_produce.timed_script import parse_timed_script_markdown


def test_synthesize_timed_script_voiceover_measures_each_scene_and_concats(monkeypatch):
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:07 | Hello world one. | Sign |\n"
        "| 0:07–0:20 | Paying is easy with OMNY. | Reader |\n"
    )["timeline"]

    calls: list[tuple[str, float]] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        calls.append((text, speed))
        # Distinct payloads so concat must join both.
        return f"SEG:{text}".encode("utf-8") * 40

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: 4.2 if data.startswith(b"SEG:Hello") else 9.6,
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"".join(parts),
    )

    audio, measured, seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice-eve",
        synthesize=fake_synthesize,
    )
    assert len(calls) == 2
    assert all(speed == 1.0 for _, speed in calls)
    assert calls[0][0].startswith("Hello world")
    assert seconds == [4.2, 9.6]
    assert measured["segments"][0]["duration_seconds"] == 4.2
    assert measured["segments"][1]["start_seconds"] == 4.2
    assert measured["segments"][1]["end_seconds"] == 13.8
    assert measured["duration_seconds"] == 13.8
    assert audio.startswith(b"SEG:Hello")
    assert b"SEG:Paying" in audio
