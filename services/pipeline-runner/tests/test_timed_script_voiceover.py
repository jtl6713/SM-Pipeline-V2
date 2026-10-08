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


def test_silent_hold_stays_out_of_tts_and_total_is_the_sum(monkeypatch):
    from studio_produce.timed_script import timeline_from_slide_lines

    timeline = timeline_from_slide_lines([
        {"line": "First stop is the riverwalk and it takes a breath.", "silent": False},
        {"line": "Second stop is the bean and the crowd around it.", "silent": False},
        {"line": "", "silent": True, "hold_seconds": 2.5},
    ], [])

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    def probe(data: bytes) -> float:
        if data == b"SILENCE":
            return 2.5
        text = data.decode("utf-8")
        return 4.2 if text.startswith("First") else 5.1

    monkeypatch.setattr("p2.timed_script_voiceover.silence_mp3_bytes", lambda _seconds: b"SILENCE")
    monkeypatch.setattr("p2.timed_script_voiceover.probe_audio_duration_bytes", probe)
    monkeypatch.setattr("p2.timed_script_voiceover.concat_mp3_bytes", lambda parts: b"|".join(parts))

    audio, measured, seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
    )
    assert seconds == [4.2, 5.1, 2.5]
    assert [segment["duration_seconds"] for segment in measured["segments"]] == [4.2, 5.1, 2.5]
    assert measured["duration_seconds"] == 11.8
    assert measured["segments"][2]["voiceover_text"] == ""
    assert measured["segments"][2]["silent"] is True
    assert b"SILENCE" in audio
    assert audio.startswith(b"First")


def test_timed_script_under_four_seconds_is_rejected(monkeypatch):
    from audio.voiceover_duration import VoiceoverTooShort

    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:02 | Your quick tour between trains. | Hall |\n"
    )["timeline"]

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda _data: 1.625,
    )
    monkeypatch.setattr("p2.timed_script_voiceover.concat_mp3_bytes", lambda parts: b"".join(parts))

    try:
        synthesize_timed_script_voiceover(
            timeline,
            voice_id="voice-eve",
            synthesize=fake_synthesize,
        )
    except VoiceoverTooShort as exc:
        assert "Not saved" in str(exc)
        assert "1.625s" in str(exc)
    else:
        raise AssertionError("short voiceover was kept")


def test_timed_script_normalizes_each_spoken_scene_before_concat(monkeypatch):
    """Independent TTS scene calls must be leveled before they are joined."""
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:05 | First scene is normal. | A |\n"
        "| 0:05–0:10 | Second scene arrived very quiet. | B |\n"
        "| 0:10–0:15 | Third scene returns to normal. | C |\n"
    )["timeline"]

    normalized_calls: list[tuple[int, str, bytes]] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return ("RAW:" + text).encode("utf-8")

    def fake_normalize(raw: bytes, scene_index: int, text: str) -> bytes:
        normalized_calls.append((scene_index, text, raw))
        return ("NORM:" + text).encode("utf-8")

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: 4.0 + (0.1 if data.startswith(b"NORM:Second") else 0.0),
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"|".join(parts),
    )

    audio, measured, seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
        normalize_segment=fake_normalize,
    )

    assert [row[0] for row in normalized_calls] == [1, 2, 3]
    assert all(row[2].startswith(b"RAW:") for row in normalized_calls)
    assert audio.count(b"NORM:") == 3
    assert b"RAW:" not in audio
    assert seconds == [4.0, 4.1, 4.0]
    assert measured["segments"][1]["duration_seconds"] == 4.1


def test_quiet_spoken_scene_retries_tts_before_normalize(monkeypatch):
    """Near-silent ElevenLabs scenes must be re-synthesized before loudnorm."""
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:05 | First scene is normal. | A |\n"
        "| 0:05–0:10 | Second scene arrived very quiet. | B |\n"
    )["timeline"]

    synthesize_calls: list[str] = []
    quiet_checks: list[bytes] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        synthesize_calls.append(text)
        if text.startswith("Second") and synthesize_calls.count(text) < 2:
            return b"QUIET:" + text.encode("utf-8")
        return b"LOUD:" + text.encode("utf-8")

    def fake_is_quiet(raw: bytes) -> bool:
        quiet_checks.append(raw)
        return raw.startswith(b"QUIET:")

    def fake_probe_volume(raw: bytes) -> float | None:
        return -22.0 if raw.startswith(b"QUIET:") else -2.0

    def fake_normalize(raw: bytes, scene_index: int, text: str) -> bytes:
        assert not raw.startswith(b"QUIET:"), "quiet take must not reach loudnorm"
        return (b"NORM:" + raw)

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: 4.0,
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"|".join(parts),
    )

    audio, _measured, _seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
        normalize_segment=fake_normalize,
        is_quiet_segment=fake_is_quiet,
        probe_segment_volume=fake_probe_volume,
        quiet_tts_attempts=3,
    )

    assert synthesize_calls.count("Second scene arrived very quiet.") == 2
    assert synthesize_calls.count("First scene is normal.") == 1
    assert any(item.startswith(b"QUIET:") for item in quiet_checks)
    assert b"NORM:LOUD:Second" in audio
    assert b"QUIET:" not in audio


def test_quiet_spoken_scene_keeps_loudest_attempt_when_all_quiet(monkeypatch):
    timeline = parse_timed_script_markdown(
        "| Time | Voiceover | Suggested still |\n"
        "| --- | --- | --- |\n"
        "| 0:00–0:05 | Always quiet scene. | A |\n"
    )["timeline"]

    synthesize_calls = 0

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        nonlocal synthesize_calls
        synthesize_calls += 1
        # Later attempts are slightly louder but still under the floor.
        return f"Q{synthesize_calls}:{text}".encode("utf-8")

    def fake_is_quiet(_raw: bytes) -> bool:
        return True

    def fake_probe_volume(raw: bytes) -> float | None:
        # Q1=-30, Q2=-25, Q3=-20 → keep attempt 3
        label = raw.decode("utf-8").split(":", 1)[0]
        return {
            "Q1": -30.0,
            "Q2": -25.0,
            "Q3": -20.0,
        }[label]

    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda _data: 4.5,
    )
    monkeypatch.setattr(
        "p2.timed_script_voiceover.concat_mp3_bytes",
        lambda parts: b"".join(parts),
    )

    audio, _measured, seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
        is_quiet_segment=fake_is_quiet,
        probe_segment_volume=fake_probe_volume,
        quiet_tts_attempts=3,
    )

    assert synthesize_calls == 3
    assert audio.startswith(b"Q3:")
    assert seconds == [4.5]


def test_silent_scene_is_not_sent_to_loudness_normalizer(monkeypatch):
    from studio_produce.timed_script import timeline_from_slide_lines

    timeline = timeline_from_slide_lines(
        [
            {"line": "Spoken scene one.", "silent": False},
            {"line": "", "silent": True, "hold_seconds": 2.0},
            {"line": "Spoken scene three.", "silent": False},
        ],
        [],
    )
    calls: list[int] = []

    def fake_synthesize(text: str, *, voice_id: str, speed: float = 1.0) -> bytes:
        return text.encode("utf-8")

    def fake_normalize(raw: bytes, scene_index: int, _text: str) -> bytes:
        calls.append(scene_index)
        return raw

    monkeypatch.setattr("p2.timed_script_voiceover.silence_mp3_bytes", lambda _seconds: b"SILENCE")
    monkeypatch.setattr(
        "p2.timed_script_voiceover.probe_audio_duration_bytes",
        lambda data: 2.0 if data == b"SILENCE" else 4.0,
    )
    monkeypatch.setattr("p2.timed_script_voiceover.concat_mp3_bytes", lambda parts: b"|".join(parts))

    _audio, _measured, _seconds = synthesize_timed_script_voiceover(
        timeline,
        voice_id="voice",
        synthesize=fake_synthesize,
        normalize_segment=fake_normalize,
    )
    assert calls == [1, 3]
