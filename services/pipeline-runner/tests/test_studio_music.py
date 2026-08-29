from studio_music.processor import drive_music_url, ingest_studio_music


class _FakeDrive:
    def upload_and_share(self, folder_id, filename, content, mime_type):
        assert folder_id == "1mzNHcVmeXb6I2WybJD5iOTrJUDRQJIN3"
        assert filename.endswith(".mp3")
        assert mime_type == "audio/mpeg"
        assert content == b"ID3fake"
        return {"id": "driveMusic1", "webViewLink": "https://drive.google.com/file/d/driveMusic1/view"}


def test_drive_music_url():
    assert drive_music_url("abc") == "https://drive.google.com/uc?export=download&id=abc"


def test_ingest_studio_music_uploads_shared_file(monkeypatch):
    monkeypatch.setattr("studio_music.processor.GoogleDriveClient", lambda: _FakeDrive())
    result = ingest_studio_music(content=b"ID3fake", filename="Sunset drone bed")
    assert result["google_drive_file_id"] == "driveMusic1"
    assert result["google_drive_url"].endswith("id=driveMusic1")
    assert result["filename"] == "Sunset drone bed.mp3"
