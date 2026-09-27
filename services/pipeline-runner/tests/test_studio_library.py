from asset.constants import GDRIVE_PHOTOS_FOLDER, GDRIVE_STUDIO_INTAKE_FOLDER, GDRIVE_VIDEO_FOLDER
from studio_library.processor import (
    classify_library_file,
    ingest_studio_library_asset,
    probe_library_video_duration,
    rename_studio_library_asset,
    watermark_existing_drive_asset,
)
from asset.helpers import drive_video_duration_seconds
from branding.watermark import profile_requires_watermark


def test_classify_library_photo_and_clip():
    photo = classify_library_file(filename="riverwalk.jpg", mime_type="image/jpeg")
    assert photo["kind"] == "image"
    assert photo["media_class"] == "Image"
    assert photo["folder_id"] == GDRIVE_STUDIO_INTAKE_FOLDER
    assert photo["folder_id"] != GDRIVE_PHOTOS_FOLDER
    clip = classify_library_file(filename="take.mov", mime_type="video/quicktime")
    assert clip["kind"] == "video"
    assert clip["asset_role"] == "Raw Footage"
    assert clip["folder_id"] == GDRIVE_VIDEO_FOLDER


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


def test_chicagoshining_profile_requires_watermark_only_for_chicago_brand():
    assert profile_requires_watermark("ChicagoShining") is True
    assert profile_requires_watermark("ChicagoShining - Chicago") is True
    assert profile_requires_watermark("New York Shining") is False
    assert profile_requires_watermark("Miami Shining") is False
    assert profile_requires_watermark("LA Shining") is False


def test_chicago_library_ingest_preserves_source_and_catalogs_watermarked_derivative(monkeypatch):
    calls = []

    class _Drive:
        def upload_file(self, folder_id, filename, content, mime_type):
            calls.append(("source", folder_id, filename, content, mime_type))
            return {"id": "sourceDrive1", "webViewLink": "https://drive/source"}

        def upload_and_share(self, folder_id, filename, content, mime_type):
            calls.append(("derived", folder_id, filename, content, mime_type))
            return {"id": "wmDrive1", "webViewLink": "https://drive/wm"}

        def get_file(self, *_args, **_kwargs):
            return {}

    monkeypatch.setattr("studio_library.processor.GoogleDriveClient", lambda: _Drive())
    monkeypatch.setattr(
        "studio_library.processor._watermark_payload",
        lambda **_kwargs: {
            "bytes": b"watermarked-photo",
            "filename": "riverwalk.jpg",
            "mime_type": "image/jpeg",
            "watermarked": True,
            "extension": "jpg",
        },
    )

    result = ingest_studio_library_asset(
        content=b"original-photo",
        filename="riverwalk.jpg",
        mime_type="image/jpeg",
        profile_name="ChicagoShining",
    )

    assert result["watermarked"] is True
    assert result["google_drive_file_id"] == "wmDrive1"
    assert result["source_google_drive_file_id"] == "sourceDrive1"
    assert calls[0][0] == "source"
    assert calls[0][1] == GDRIVE_STUDIO_INTAKE_FOLDER
    assert "__source" in calls[0][2]
    assert calls[1][0] == "derived"


def test_existing_chicago_asset_gets_watermarked_derivative(monkeypatch):
    class _Drive:
        def download_file(self, file_id):
            assert file_id == "rawDrive1"
            return b"original", "image/jpeg"

        def upload_and_share(self, folder_id, filename, content, mime_type):
            assert content == b"watermarked"
            return {"id": "wmDrive2", "webViewLink": "https://drive/wm2"}

    monkeypatch.setattr("studio_library.processor.GoogleDriveClient", lambda: _Drive())
    monkeypatch.setattr(
        "studio_library.processor._watermark_payload",
        lambda **_kwargs: {
            "bytes": b"watermarked",
            "filename": "old-photo.jpg",
            "mime_type": "image/jpeg",
            "watermarked": True,
            "extension": "jpg",
        },
    )

    result = watermark_existing_drive_asset(
        file_id="rawDrive1",
        filename="old-photo.jpg",
        mime_type="image/jpeg",
        profile_name="ChicagoShining",
    )
    assert result["watermarked"] is True
    assert result["google_drive_file_id"] == "wmDrive2"
    assert result["source_google_drive_file_id"] == "rawDrive1"
