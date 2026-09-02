from __future__ import annotations

from typing import Any

import a1p.processor as a1p_processor
import a1s.compressor as compressor


class _Response:
    def __init__(self, payload: dict[str, Any], *, status_code: int = 200, content: bytes = b"") -> None:
        self._payload = payload
        self.status_code = status_code
        self.content = content
        self.headers = {"Content-Type": "video/mp4"}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> dict[str, Any]:
        return self._payload


def test_submit_uses_private_drive_id_and_byte_target(monkeypatch):
    captured: dict[str, Any] = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return _Response(
            {
                "job_id": "job-1",
                "status": "queued",
                "status_url": "http://127.0.0.1:3335/jobs/job-1",
            },
            status_code=202,
        )

    monkeypatch.setattr(compressor.requests, "post", fake_post)
    result = compressor.submit_job("private-drive-file", "Streeterville 1.mp4")

    assert result["job_id"] == "job-1"
    assert captured["url"] == "http://127.0.0.1:3335/compress"
    assert captured["json"]["drive_file_id"] == "private-drive-file"
    assert "source_url" not in captured["json"]
    assert captured["json"]["target_mb"] * 1024 * 1024 == 84_000_000


class _FakeAirtable:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []
        self.deleted: list[str] = []

    def update_record(self, _table, record_id, fields):
        self.updates.append({"record_id": record_id, "fields": fields})
        return {"id": record_id}

    def delete_record(self, _table, record_id):
        self.deleted.append(record_id)
        return {"id": record_id, "deleted": True}


class _FakeDrive:
    def __init__(self) -> None:
        self.uploads: list[dict[str, Any]] = []
        self.trashed: set[str] = set()

    def list_files(self, **_kwargs):
        return []

    def upload_file(self, folder_id, filename, content, mime_type):
        self.uploads.append(
            {
                "folder_id": folder_id,
                "filename": filename,
                "content": content,
                "mime_type": mime_type,
            }
        )
        return {"id": "replacement-file"}

    def get_file(self, file_id, *, fields=""):
        if file_id == "replacement-file":
            return {
                "id": file_id,
                "name": "Streeterville 1_compressed.mp4",
                "mimeType": "video/mp4",
                "size": "4",
                "parents": ["1VpjoRDHbwUlQrrEjfEpkGrIz1HFFtNNX"],
                "trashed": False,
            }
        return {
            "id": file_id,
            "parents": ["1VpjoRDHbwUlQrrEjfEpkGrIz1HFFtNNX"],
            "trashed": file_id in self.trashed,
        }

    def trash_file(self, file_id):
        self.trashed.add(file_id)
        return {"id": file_id, "trashed": True}


def test_poller_defers_active_job(monkeypatch):
    airtable = _FakeAirtable()
    scheduled: list[dict[str, Any]] = []
    monkeypatch.setattr(a1p_processor, "AirtableClient", lambda: airtable)
    monkeypatch.setattr(
        a1p_processor,
        "poll_job",
        lambda _job_id: {"job_id": "job-1", "status": "compressing", "progress": 42},
    )
    monkeypatch.setattr(a1p_processor, "_schedule_next", scheduled.append)

    result = a1p_processor.process_request(
        job_id="job-1",
        status_url="http://127.0.0.1:3335/jobs/job-1",
        state_record_id="rec-state",
        source_file_id="source-file",
        source_name="Streeterville 1.mp4",
        source_size="106015623",
        attempt="1",
        poller_url="https://pipeline.example/hooks/a1p/token",
    )

    assert result["status"] == "processing"
    assert result["deferred"] is True
    assert "42%" in airtable.updates[0]["fields"]["Notes"]
    assert scheduled[0]["attempt"] == 2
    assert scheduled[0]["status_url"].endswith("/jobs/job-1")
    assert airtable.deleted == []


def test_completed_job_is_verified_before_source_is_trashed(monkeypatch):
    airtable = _FakeAirtable()
    drive = _FakeDrive()
    cleaned: list[str] = []
    monkeypatch.setattr(a1p_processor, "AirtableClient", lambda: airtable)
    monkeypatch.setattr(a1p_processor, "GoogleDriveClient", lambda: drive)
    monkeypatch.setattr(
        a1p_processor,
        "poll_job",
        lambda _job_id: {
            "job_id": "job-1",
            "status": "complete",
            "output_size_bytes": 4,
            "output_url": "http://127.0.0.1:3335/files/job-1.mp4",
        },
    )
    monkeypatch.setattr(a1p_processor, "download_output", lambda _job: (b"mp4!", "video/mp4"))
    monkeypatch.setattr(a1p_processor, "delete_job", cleaned.append)

    result = a1p_processor.process_request(
        job_id="job-1",
        state_record_id="rec-state",
        source_file_id="source-file",
        source_name="Streeterville 1.mp4",
        source_size="106015623",
        attempt="2",
    )

    assert result["status"] == "finished"
    assert result["new_file_id"] == "replacement-file"
    assert result["new_size"] == 4
    assert result["source_trashed"] is True
    assert "source-file" in drive.trashed
    assert drive.uploads[0]["filename"] == "Streeterville 1_compressed.mp4"
    assert cleaned == ["job-1"]
    assert airtable.deleted == ["rec-state"]


def test_failed_job_preserves_source_and_clears_state(monkeypatch):
    airtable = _FakeAirtable()
    cleaned: list[str] = []
    monkeypatch.setattr(a1p_processor, "AirtableClient", lambda: airtable)
    monkeypatch.setattr(
        a1p_processor,
        "poll_job",
        lambda _job_id: {"job_id": "job-1", "status": "failed", "error": "download_failed"},
    )
    monkeypatch.setattr(a1p_processor, "delete_job", cleaned.append)

    result = a1p_processor.process_request(
        job_id="job-1",
        state_record_id="rec-state",
        source_file_id="source-file",
        source_name="Streeterville 1.mp4",
        attempt="2",
    )

    assert result["status"] == "failed_local_compressor"
    assert airtable.deleted == ["rec-state"]
    assert cleaned == ["job-1"]
