from audio.wav_to_mp3 import (
    WavConvertResult,
    apply_drive_wav_to_mp3,
    convert_wav_if_needed,
    is_wav_audio,
    mp3_filename,
)


def test_wav_detection_and_mp3_name():
    assert is_wav_audio(filename="bed.wav") is True
    assert is_wav_audio(mime_type="audio/x-wav") is True
    assert is_wav_audio(filename="bed.mp3", mime_type="audio/mpeg") is False
    assert mp3_filename("Sunset drone bed.wav") == "Sunset drone bed.mp3"


def test_convert_wav_if_needed_passthrough_for_mp3():
    result = convert_wav_if_needed(b"ID3fake", "bed.mp3", "audio/mpeg")
    assert result.changed is False
    assert result.content == b"ID3fake"
    assert result.filename == "bed.mp3"


def test_convert_wav_if_needed_encodes(monkeypatch):
    monkeypatch.setattr("audio.wav_to_mp3.wav_to_mp3", lambda content, filename: b"ID3converted")
    result = convert_wav_if_needed(b"RIFFwav", "Sunset drone bed.wav", "audio/wav")
    assert result.changed is True
    assert result.filename == "Sunset drone bed.mp3"
    assert result.content == b"ID3converted"
    assert result.mime_type == "audio/mpeg"


def test_apply_drive_wav_replaces_media_and_name(monkeypatch):
    class _Drive:
        def __init__(self):
            self.updated = None
            self.meta = None

        def download_file(self, file_id):
            assert file_id == "drive1"
            return b"RIFFwav", "audio/wav"

        def update_media(self, file_id, content, mime_type):
            self.updated = (file_id, content, mime_type)

        def update_metadata(self, file_id, *, name=None, mime_type=None):
            self.meta = (file_id, name, mime_type)

    drive = _Drive()
    monkeypatch.setattr("audio.wav_to_mp3.wav_to_mp3", lambda content, filename: b"ID3converted")
    result = apply_drive_wav_to_mp3(drive, "drive1", filename="bed.wav", mime_type="audio/wav")
    assert result.changed is True
    assert drive.updated == ("drive1", b"ID3converted", "audio/mpeg")
    assert drive.meta == ("drive1", "bed.mp3", "audio/mpeg")


def test_apply_drive_wav_skips_mp3():
    class _Drive:
        def download_file(self, file_id):
            raise AssertionError("should not download MP3")

    result = apply_drive_wav_to_mp3(_Drive(), "drive1", filename="bed.mp3", mime_type="audio/mpeg")
    assert result == WavConvertResult(False, "bed.mp3", b"", "audio/mpeg", 0)
