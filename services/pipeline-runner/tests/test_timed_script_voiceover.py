"""Per-scene timed-script voiceover synthesis locked to import windows."""

from __future__ import annotations

from p2.timed_script_voiceover import synthesize_timed_script_voiceover
from studio_produce.timed_script import parse_timed_script_markdown


def test_synthesize_timed_script_voiceover_fits_each_scene_to_import_window(monkeypatch):
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:07 | Hello world one. | Sign |\n"
        "| 0:07–0:20 | Paying is easy with OMNY. | Reader |\n"
    )["timeline"]

    calls: list[tuple[str, float]] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        calls.append((text, speed))
        return f"SEG:{text}".encode("utf-8") * 40

    fitted_targets: list[float] = []

    def fake_fit(data: bytes, target_seconds: float, **_kwargs) -> bytes:
        fitted_targets.append(float(target_seconds))
        return data + f"|FIT:{target_seconds}".encode("utf-8")

    monkeypatch.setattr("p2.timed_script_voiceover.fit_mp3_to_duration_bytes", fake_fit)
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"".join(parts),
    )

    audio, locked, windows = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice-eve",
        synthesize=fake_synthesize,
    )
    assert len(calls) == 2
    assert fitted_targets == [7.0, 13.0]
    assert windows == [7.0, 13.0]
    # Import clock is preserved — scene 2 still starts at 7s / scene 3 would be 20s.
    assert locked["segments"][0]["duration_seconds"] == 7
    assert locked["segments"][1]["start_seconds"] == 7
    assert locked["segments"][1]["end_seconds"] == 20
    assert locked["duration_seconds"] == 20
    assert audio.startswith(b"SEG:Hello")
    assert b"SEG:Paying" in audio
    assert b"|FIT:7.0" in audio
    assert b"|FIT:13.0" in audio


def test_nyc_scene3_stays_at_import_20_seconds(monkeypatch):
    """Regression: concat VO used to put 'Before you go down the stairs' near 13s."""
    from studio_produce.timed_script import parse_timed_script_markdown

    nyc = (
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:07 | First time on the NYC subway? | Platform |\n"
        "| 0:07–0:20 | Paying is easy. Skip the MetroCard. | OMNY |\n"
        "| 0:20–0:33 | Before you go down the stairs, check the sign. | Entrance |\n"
    )
    timeline = parse_timed_script_markdown(nyc)["timeline"]
    assert timeline["segments"][2]["start_seconds"] == 20
    assert timeline["segments"][2]["voiceover_text"].startswith("Before you go down the stairs")

    monkeypatch.setattr(
        "p2.timed_script_voiceover.fit_mp3_to_duration_bytes",
        lambda data, target_seconds, **_kwargs: data,
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"x" * len(parts),
    )

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    _audio, locked, windows = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
    )
    assert windows == [7.0, 13.0, 13.0]
    assert locked["segments"][2]["start_seconds"] == 20
    assert sum(windows) == 33
