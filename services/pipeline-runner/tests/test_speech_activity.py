"""Speech-activity floor for near-silent timed-script TTS scenes."""

from audio.speech_activity import (
    MIN_MAX_VOLUME_DB,
    is_quiet_speech,
    parse_max_volume_db,
)


def test_parse_max_volume_db_reads_last_volumedetect_line():
    stderr = (
        "[Parsed_volumedetect_0 @ 0x1] mean_volume: -37.2 dB\n"
        "[Parsed_volumedetect_0 @ 0x1] max_volume: -21.6 dB\n"
    )
    assert parse_max_volume_db(stderr) == -21.6


def test_parse_max_volume_db_returns_none_when_missing():
    assert parse_max_volume_db("no metrics here") is None


def test_is_quiet_speech_uses_floor(monkeypatch):
    monkeypatch.setattr(
        "audio.speech_activity.probe_max_volume_db",
        lambda _data, filename="scene.mp3": -21.6,
    )
    assert is_quiet_speech(b"quiet-mp3") is True
    assert is_quiet_speech(b"quiet-mp3", min_max_volume_db=-22.0) is False


def test_is_quiet_speech_fails_open_when_probe_unavailable(monkeypatch):
    monkeypatch.setattr(
        "audio.speech_activity.probe_max_volume_db",
        lambda _data, filename="scene.mp3": None,
    )
    assert is_quiet_speech(b"unknown") is False


def test_min_max_volume_floor_matches_calle_ocho_scene5():
    # Proven fixture: Calle Ocho scene 5 max_volume ≈ -21.6 dB; siblings ≈ -2 dB.
    assert MIN_MAX_VOLUME_DB == -18.0
    assert -21.6 < MIN_MAX_VOLUME_DB
    assert -1.9 >= MIN_MAX_VOLUME_DB
