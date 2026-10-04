"""Per-scene timed-script voiceover — VO-driven measured durations."""

from __future__ import annotations

from p2.timed_script_voiceover import synthesize_timed_script_voiceover
from studio_produce.timed_script import apply_measured_durations, parse_timed_script_markdown


def test_synthesize_timed_script_voiceover_measures_each_scene_and_concats(monkeypatch):
    """Import says 7s+13s; TTS speaks 4.2s+9.6s → stills follow speech, not import."""
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:07 | Hello world one. | Sign |\n"
        "| 0:07–0:20 | Paying is easy with OMNY. | Reader |\n"
    )["timeline"]
    assert timeline["segments"][0]["duration_seconds"] == 7
    assert timeline["segments"][1]["duration_seconds"] == 13

    calls: list[tuple[str, float]] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        calls.append((text, speed))
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


def test_import_20s_tts_13s_still_becomes_13s(monkeypatch):
    """Joseph: if import had scene3 @20s but TTS speaks in 13s, still shows 13s."""
    nyc = (
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:07 | First time on the NYC subway? | Platform |\n"
        "| 0:07–0:20 | Paying is easy. Skip the MetroCard. | OMNY |\n"
        "| 0:20–0:33 | Before you go down the stairs, check the sign. | Entrance |\n"
    )
    timeline = parse_timed_script_markdown(nyc)["timeline"]
    assert timeline["segments"][2]["start_seconds"] == 20
    assert timeline["segments"][2]["duration_seconds"] == 13
    assert timeline["segments"][2]["voiceover_text"].startswith("Before you go down the stairs")

    # Natural TTS: scene 3 speaks in 13s (same as its import window here) while
    # scenes 1–2 are shorter than import — total follows speech, not 33s import.
    spoken = [5.0, 8.0, 13.0]

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: spoken[0] if data.startswith(b"First") else (
            spoken[1] if data.startswith(b"Paying") else spoken[2]
        ),
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"x" * len(parts),
    )

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    _audio, measured, windows = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
    )
    assert windows == spoken
    assert measured["segments"][2]["duration_seconds"] == 13.0
    assert measured["segments"][2]["start_seconds"] == 13.0  # 5+8, not import 20
    assert measured["duration_seconds"] == 26.0
    assert measured["segments"][2]["voiceover_text"].startswith("Before you go down the stairs")


def test_three_scenes_different_spoken_lengths_total_is_sum():
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:20 | Scene one text. | A |\n"
        "| 0:20–0:40 | Scene two text. | B |\n"
        "| 0:40–1:00 | Scene three text. | C |\n"
    )["timeline"]
    # Import locked each at 20s; speech differs per scene.
    spoken = [13.0, 25.0, 9.5]
    rebuilt = apply_measured_durations(timeline, spoken)
    assert rebuilt is not None
    assert [seg["duration_seconds"] for seg in rebuilt["segments"]] == spoken
    assert rebuilt["segments"][0]["start_seconds"] == 0
    assert rebuilt["segments"][1]["start_seconds"] == 13.0
    assert rebuilt["segments"][2]["start_seconds"] == 38.0
    assert rebuilt["duration_seconds"] == sum(spoken)


def test_timed_script_under_four_seconds_is_rewritten_and_not_kept_short(monkeypatch):
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:02 | Your quick tour between trains. | Hall |\n"
    )["timeline"]

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    def lengthen(text: str, *, measured_seconds: float) -> str:
        assert measured_seconds < 4
        return text + " Look up at the ceiling, then move through with the crowd."

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: 1.625 if b"Look up" not in data else 4.4,
    )
    monkeypatch.setattr("p2.timed_script_voiceover.concat_mp3_bytes", lambda parts: b"".join(parts))

    _audio, measured, seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice-eve",
        synthesize=fake_synthesize,
        lengthen=lengthen,
    )
    assert sum(seconds) >= 4
    assert measured["segments"][-1]["voiceover_text"].endswith("crowd.")
