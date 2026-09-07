from studio_library.processor import classify_library_file, probe_library_video_duration, rename_studio_library_asset
from asset.helpers import drive_video_duration_seconds


def test_classify_library_photo_and_clip():
    photo = classify_library_file(filename="riverwalk.jpg", mime_type="image/jpeg")
    assert photo["kind"] == "image"
    assert photo["media_class"] == "Image"
    clip = classify_library_file(filename="take.mov", mime_type="video/quicktime")
    assert clip["kind"] == "video"
    assert clip["asset_role"] == "Raw Footage"


def test_classify_library_rejects_audio():
    try:
        classify_library_file(filename="bed.mp3", mime_type="audio/mpeg")
    except ValueError as exc:
        assert "supported" in str(exc)
        return
    raise AssertionError("audio should not classify as a library still or clip")


def test_drive_video_duration_seconds_from_metadata():
    assert drive_video_duration_seconds({"videoMediaMetadata": {"durationMillis": "42100"}}) == 42
    assert drive_video_duration_seconds({"videoMediaMetadata": {}}) is None
    assert drive_video_duration_seconds({}) is None


def test_probe_library_video_duration_skips_empty():
    assert probe_library_video_duration(b"", "clip.mp4") is None


def test_rename_studio_library_asset_calls_drive(monkeypatch):
    class _Drive:
        def rename_file(self, file_id, name):
            return {"id": file_id, "name": name}

    monkeypatch.setattr("studio_library.processor.GoogleDriveClient", lambda: _Drive())
    result = rename_studio_library_asset(file_id="drive1", filename="Oak Street Beach.jpg")
    assert result["ok"] is True
    assert result["google_drive_file_id"] == "drive1"
    assert result["filename"] == "Oak Street Beach.jpg"


def test_rename_studio_library_asset_requires_file_id():
    try:
        rename_studio_library_asset(file_id="", filename="x.jpg")
    except ValueError as exc:
        assert "google_drive_file_id" in str(exc)
        return
    raise AssertionError("empty file id should fail")
