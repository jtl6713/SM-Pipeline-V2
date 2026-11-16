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
    monkeypatch.setattr("studio_library.processor.screen_asset", lambda **_kwargs: {
        "decision": "clean", "indicators": [],
        "evidence": "No overlays found", "frames_checked": 1,
    })
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


def test_chicago_library_ingest_can_skip_source_master_on_hot_path(monkeypatch):
    monkeypatch.setattr("studio_library.processor.screen_asset", lambda **_kwargs: {
        "decision": "clean", "indicators": [],
        "evidence": "No overlays found", "frames_checked": 1,
    })
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
        skip_source_master=True,
    )

    assert result["watermarked"] is True
    assert result["google_drive_file_id"] == "wmDrive1"
    assert result["source_google_drive_file_id"] is None
    assert result["source_master_deferred"] is True
    assert calls == [("derived", GDRIVE_STUDIO_INTAKE_FOLDER, "riverwalk.jpg", b"watermarked-photo", "image/jpeg")]


def test_existing_chicago_asset_gets_watermarked_derivative(monkeypatch):
    monkeypatch.setattr("studio_library.processor.screen_asset", lambda **_kwargs: {
        "decision": "clean", "indicators": [],
        "evidence": "No overlays found", "frames_checked": 1,
    })
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


def test_brand_watermark_bytes_prefers_authenticated_drive(monkeypatch):
    from branding import watermark as watermark_module

    watermark_module._BRAND_WATERMARK_CACHE["bytes"] = b""
    watermark_module._BRAND_WATERMARK_CACHE["at"] = 0.0

    class _Airtable:
        def list_records(self, *_args, **_kwargs):
            return [{
                "id": "recWatermark",
                "fields": {
                    "Google Drive File ID": "driveWatermark1",
                    "Google Drive URL": "https://drive.google.com/uc?export=download&id=driveWatermark1",
                },
            }]

    class _Drive:
        def download_file(self, file_id):
            assert file_id == "driveWatermark1"
            return b"official-watermark", "image/png"

    monkeypatch.setattr(watermark_module, "GoogleDriveClient", lambda: _Drive())
    monkeypatch.setattr(
        watermark_module.requests,
        "get",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("public URL should not be used")),
    )

    assert watermark_module.brand_watermark_bytes(_Airtable()) == b"official-watermark"
    # Second call must use the in-process cache (no second Airtable/Drive hit).
    assert watermark_module.brand_watermark_bytes(_Airtable()) == b"official-watermark"


def test_brand_watermark_bytes_falls_back_to_known_drive_id(monkeypatch):
    from branding import watermark as watermark_module

    watermark_module._BRAND_WATERMARK_CACHE["bytes"] = b""
    watermark_module._BRAND_WATERMARK_CACHE["at"] = 0.0

    class _Airtable:
        def list_records(self, *_args, **_kwargs):
            return []

    class _Drive:
        def download_file(self, file_id):
            assert file_id == watermark_module.FALLBACK_SMALL_WATERMARK_DRIVE_ID
            return b"fallback-watermark", "image/png"

    monkeypatch.setattr(watermark_module, "GoogleDriveClient", lambda: _Drive())
    assert watermark_module.brand_watermark_bytes(_Airtable()) == b"fallback-watermark"


def test_chicago_library_ingest_defers_when_watermark_unavailable(monkeypatch):
    monkeypatch.setattr("studio_library.processor.screen_asset", lambda **_kwargs: {
        "decision": "clean", "indicators": [],
        "evidence": "No overlays found", "frames_checked": 1,
    })
    calls = []

    class _Drive:
        def upload_and_share(self, folder_id, filename, content, mime_type):
            calls.append((folder_id, filename, content, mime_type))
            return {"id": "rawDrive1", "webViewLink": "https://drive/raw"}

    monkeypatch.setattr("studio_library.processor.GoogleDriveClient", lambda: _Drive())
    monkeypatch.setattr(
        "studio_library.processor.brand_watermark_bytes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("C6 watermark asset view returned no active branding watermark")),
    )

    result = ingest_studio_library_asset(
        content=b"original-photo",
        filename="riverwalk.jpg",
        mime_type="image/jpeg",
        profile_name="ChicagoShining",
        skip_source_master=True,
    )
    assert result["watermarked"] is False
    assert result["watermark_deferred"] is True
    assert result["google_drive_file_id"] == "rawDrive1"
    assert calls and calls[0][2] == b"original-photo"


def test_async_library_ingest_job_completes(monkeypatch):
    import time
    from studio_library import async_jobs

    monkeypatch.setattr(
        "studio_library.processor.ingest_studio_library_asset",
        lambda **_kwargs: {
            "ok": True,
            "google_drive_file_id": "driveAsync1",
            "google_drive_url": "https://drive.google.com/uc?export=download&id=driveAsync1",
        },
    )
    job_id = async_jobs.start_library_ingest_job(
        content=b"photo-bytes",
        filename="pier.jpg",
        mime_type="image/jpeg",
        profile_name="ChicagoShining",
        skip_source_master=True,
    )
    deadline = time.time() + 2
    job = None
    while time.time() < deadline:
        job = async_jobs.get_library_ingest_job(job_id)
        if job and job.get("status") in {"ok", "error"}:
            break
        time.sleep(0.05)
    assert job is not None
    assert job["status"] == "ok"
    assert job["result"]["google_drive_file_id"] == "driveAsync1"
