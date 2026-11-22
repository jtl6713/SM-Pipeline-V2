"""Incident 2670: image ingestion resumes without unpausing provider or production work."""
from io import BytesIO

import pytest
import app as runner
from studio_library import async_jobs


@pytest.fixture
def safe_upload(monkeypatch, tmp_path):
    monkeypatch.setenv("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "true")
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "true")
    monkeypatch.setenv("STUDIO_GOVERNOR_DB_PATH", str(tmp_path / "governor.sqlite3"))
    monkeypatch.setenv("I1_DURABLE_ENABLED", "false")
    monkeypatch.setenv("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED", "false")
    monkeypatch.setenv("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED", "false")
    monkeypatch.setitem(runner.settings, "pipeline_runner_shared_secret", "test-secret")
    monkeypatch.setattr(async_jobs, "start_library_ingest_job", lambda **_kwargs: "test-only-job")
    return runner.app.test_client()


def _photo_data(name="IMG_0001.jpg", mime="image/jpeg"):
    return {
        "filename": name,
        "mime_type": mime,
        "profile_name": "Chicago Shining",
        "file": (BytesIO(b"photo bytes"), name, mime),
    }


def test_authenticated_photo_upload_allowed_without_starting_other_jobs(safe_upload):
    response = safe_upload.post(
        "/jobs/studio-asset-library", data=_photo_data(),
        headers={"X-Pipeline-Secret": "test-secret"},
    )
    assert response.status_code == 202
    assert response.json["job_id"] == "test-only-job"
    assert safe_upload.get("/health").json["recovery_read_only"] is True
    assert safe_upload.get("/health").json["recovery_image_upload_enabled"] is True
    for path in ("/jobs/studio-produce", "/stages/a3", "/jobs/studio-music-library",
                 "/jobs/studio-asset-library-delete", "/jobs/studio-asset-watermark"):
        result = safe_upload.post(path, data={})
        assert result.status_code == 503
        assert result.json["error"] == "runner_recovery_read_only"


def test_recovery_upload_requires_auth_and_governor(safe_upload, monkeypatch):
    response = safe_upload.post("/jobs/studio-asset-library", data=_photo_data())
    assert response.status_code == 401
    monkeypatch.setenv("STUDIO_WORKLOAD_GOVERNOR_ENABLED", "false")
    blocked = safe_upload.post("/jobs/studio-asset-library", data=_photo_data(),
                               headers={"X-Pipeline-Secret": "test-secret"})
    assert blocked.status_code == 503


def test_photo_only_rejects_video_and_unknown_files(safe_upload):
    for name,mime in (("movie.mov","video/quicktime"),("data.csv","text/csv")):
        response = safe_upload.post("/jobs/studio-asset-library",
            data=_photo_data(name, mime), headers={"X-Pipeline-Secret": "test-secret"})
        assert response.status_code in (415,503)
        assert "only_photo" in response.json["error"]


def test_recovery_refuses_large_body_before_parsing(safe_upload):
    result = safe_upload.post("/jobs/studio-asset-library", data=_photo_data(),
                              headers={"X-Pipeline-Secret": "test-secret",
                                       "Content-Length": str(27*1024*1024)})
    # Flask test client can normalize Content-Length: force a request with a
    # 26+ MB payload to exercise Werkzeug's actual bound instead.
    if result.status_code != 413:
        big = {
            "filename": "large.jpg", "mime_type": "image/jpeg",
            "file": (BytesIO(b"x" * (26 * 1024 * 1024)), "large.jpg", "image/jpeg"),
        }
        result = safe_upload.post("/jobs/studio-asset-library",
            data=big, headers={"X-Pipeline-Secret": "test-secret"})
    assert result.status_code == 413


def test_upload_recovery_slot_only_while_other_resources_remain_closed(safe_upload):
    from studio_produce import workload_governor as gov
    assert gov.admission_paused() is True
    with gov.resource_slot("library_image_upload", limit=1, allow_during_recovery=True):
        assert gov.resource_active("library_image_upload", "") is False
        with pytest.raises(gov.AdmissionDeferred):
            with gov.resource_slot("photo_group", limit=2, allow_during_recovery=True):
                raise AssertionError("other media processing must stay paused")
        with pytest.raises(gov.AdmissionDeferred):
            with gov.resource_slot("supabase_write", limit=2, allow_during_recovery=True):
                raise AssertionError("database writes must stay paused")


def test_background_consumers_must_be_off(safe_upload, monkeypatch):
    monkeypatch.setenv("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED", "true")
    assert safe_upload.post("/jobs/studio-asset-library",
        data=_photo_data(), headers={"X-Pipeline-Secret": "test-secret"}).status_code == 503
