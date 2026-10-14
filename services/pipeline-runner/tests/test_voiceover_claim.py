from datetime import datetime, timedelta, timezone

from p2.voiceover_claim import (
    drive_voiceover_url,
    lease_is_fresh,
    lease_text,
    script_fingerprint,
)


def test_same_script_and_voice_share_one_fingerprint():
    first = script_fingerprint("hv8WzBOrsvuSUeIQGOCM", "Golden hour at the Getty hits different.")
    second = script_fingerprint("hv8WzBOrsvuSUeIQGOCM", "  Golden hour at the Getty hits different.  ")
    other = script_fingerprint("xVQH621DS3eyBYrseRt5", "Golden hour at the Getty hits different.")
    assert first == second
    assert first != other


def test_fresh_lease_blocks_a_second_read_of_the_same_sentence():
    now = datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)
    fingerprint = script_fingerprint("voice", "Golden hour at the Getty hits different.")
    details = lease_text(fingerprint, now=now, claim="first-reader")
    other = lease_text(fingerprint, now=now, claim="second-reader")
    assert details != other
    assert details.startswith("tts-lease:")
    assert lease_is_fresh(details, fingerprint, now=now + timedelta(minutes=5))
    assert lease_is_fresh(details, fingerprint, now=now + timedelta(minutes=21)) is False
    assert lease_is_fresh(details, "someone-else", now=now) is False
    assert lease_is_fresh("normalized audio", fingerprint, now=now) is False


def test_drive_file_becomes_the_voiceover_url_without_a_new_read():
    assert drive_voiceover_url({"webContentLink": "https://drive.example/vo.mp3"}, "file") == "https://drive.example/vo.mp3"
    assert "id=file123" in drive_voiceover_url({}, "file123")
