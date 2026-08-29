from audio.backfill import _pending_formula, _record_ids_formula
from audio.leading_silence import (
    STATUS_CAPPED,
    STATUS_FAILED,
    STATUS_NOT_NEEDED,
    LeadingSilenceResult,
    apply_drive_leading_silence,
    cap_leading_silence,
    cut_seconds_for_leading,
    is_voiceover_audio,
    parse_leading_silence_seconds,
)
from studio_music.processor import ingest_studio_music


def test_parse_leading_silence_from_ffmpeg_log():
    stderr = """
[silencedetect @ 000] silence_start: 0
[silencedetect @ 000] silence_end: 2.05 | silence_duration: 2.05
"""
    assert parse_leading_silence_seconds(stderr) == 2.05
    assert parse_leading_silence_seconds("silence_start: 1.2\nsilence_end: 2.0") == 0.0
    assert parse_leading_silence_seconds("") == 0.0


def test_cut_keeps_half_second_pad():
    assert cut_seconds_for_leading(0.4) == 0.0
    assert cut_seconds_for_leading(0.5) == 0.0
    assert cut_seconds_for_leading(2.05) == 1.55


def test_ingest_studio_music_trims_before_drive_upload(monkeypatch):
    trimmed = LeadingSilenceResult(STATUS_CAPPED, 2.05, 1.55, b"ID3trimmed", True)

    class _FakeDrive:
        def upload_and_share(self, folder_id, filename, content, mime_type):
            assert content == b"ID3trimmed"
            assert filename == "Sunset drone bed.mp3"
            return {"id": "driveMusic1", "webViewLink": "https://drive.google.com/file/d/driveMusic1/view"}

    monkeypatch.setattr("studio_music.processor.cap_leading_silence", lambda content, filename: trimmed)
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient", lambda: _FakeDrive())
    result = ingest_studio_music(content=b"ID3fake", filename="Sunset drone bed")
    assert result["google_drive_file_id"] == "driveMusic1"
    assert result["leading_silence_status"] == STATUS_CAPPED
    assert result["leading_silence_removed_seconds"] == 1.55
    assert result["file_size_bytes"] == len(b"ID3trimmed")
    assert result["Leading_Silence_Status"] == STATUS_CAPPED


def test_cap_leading_silence_empty_file():
    result = cap_leading_silence(b"", "empty.mp3")
    assert result.status == STATUS_FAILED
    assert result.changed is False


def test_voiceover_assets_are_not_trimmed():
    assert is_voiceover_audio(role="Voiceover", filename="bed.mp3") is True
    assert is_voiceover_audio(filename="recABC_voice_normalized.mp3") is True
    assert is_voiceover_audio(filename="ElevenLabs_Kate - English Female Voice With Soft Accent_pvc.mp3") is True
    assert is_voiceover_audio(filename="Sunset drone bed.mp3", role="Music") is False


def test_backfill_formula_skips_already_capped():
    pending = _pending_formula(force=False)
    assert "{Media_Class}='Audio'" in pending
    assert "{Asset_Role}!='Voiceover'" in pending
    assert "Failed" in pending
    assert "BLANK()" in pending
    forced = _pending_formula(force=True)
    assert "Failed" not in forced
    scoped = _record_ids_formula(["recABC12345678901"], force=False)
    assert "RECORD_ID()='recABC12345678901'" in scoped


def test_apply_drive_replaces_same_file_when_trimmed(monkeypatch):
    class _Drive:
        def __init__(self):
            self.updated = None

        def download_file(self, file_id):
            assert file_id == "drive1"
            return b"ID3raw", "audio/mpeg"

        def update_media(self, file_id, content, mime_type):
            self.updated = (file_id, content, mime_type)
            return {"id": file_id}

    drive = _Drive()
    monkeypatch.setattr(
        "audio.leading_silence.cap_leading_silence",
        lambda content, filename: LeadingSilenceResult(STATUS_CAPPED, 2.0, 1.5, b"ID3cut", True),
    )
    result = apply_drive_leading_silence(drive, "drive1", filename="bed.mp3", mime_type="audio/mpeg")
    assert result.changed is True
    assert drive.updated == ("drive1", b"ID3cut", "audio/mpeg")


def test_airtable_stamp_fields():
    result = LeadingSilenceResult(STATUS_NOT_NEEDED, 0.2, 0.0, b"x", False)
    fields = result.airtable_fields()
    assert fields["Leading_Silence_Status"] == STATUS_NOT_NEEDED
    assert fields["Leading_Silence_Removed_Seconds"] == 0.0
    assert "T" in str(fields["Leading_Silence_Processed_At"])
