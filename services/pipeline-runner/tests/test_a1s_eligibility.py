from a1m.processor import _probe_one
from a1s.compressor import target_mb
from a1s.eligibility import eligibility_reason
from carousel.timeutil import iso_ms
from a1s.processor import process_request
from stages.registry import STAGE_NAMES, is_implemented


def _file(**fields):
    return {
        "id": "drive-file",
        "name": "clip.mp4",
        "mimeType": "video/mp4",
        "size": "150000000",
        **fields,
    }


def test_a1s_and_a1m_are_registered():
    for name in ("a1s", "a1m"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_a1s_eligibility_gates():
    ready = _file()
    assert eligibility_reason(ready, threshold_bytes=100000000) is None
    assert eligibility_reason(_file(mimeType="image/jpeg"), threshold_bytes=100000000) == "not_video"
    assert eligibility_reason(_file(size="100000000"), threshold_bytes=100000000) == "not_oversize"
    assert eligibility_reason(_file(size="99999999"), threshold_bytes=100000000) == "not_oversize"
    assert eligibility_reason(_file(name="clip_compressed.mp4"), threshold_bytes=100000000) == "already_compressed"
    assert eligibility_reason(ready, threshold_bytes=100000000, has_active_job=True) == "active_job"
    assert eligibility_reason(ready, threshold_bytes=100000000, has_active_job=True, check_job=False) is None


def test_local_target_and_drive_duration_metadata():
    assert target_mb() * 1024 * 1024 == 84_000_000
    result = _probe_one(
        _file(videoMediaMetadata={"durationMillis": "15166"}),
        sleep=lambda _seconds: None,
    )
    assert result["duration_seconds"] == 15.166
    assert result["metadata_source"] == "google_drive"
    assert result["status"] == "probed"


class _FakeDrive:
    def get_file(self, file_id, *, fields=""):
        return _file(id=file_id)

    def list_files(self, **_kwargs):
        return [_file()]


class _FakeSettings:
    def get(self, name):
        values = {
            "A1_COMPRESSION_THRESHOLD_BYTES": "100000000",
            "A1_POLLER_WEBHOOK_URL": "https://pipeline.example/hooks/a1p/token",
        }
        return values.get(name, "")


class _FakeAirtable:
    def __init__(self, jobs=None):
        self.jobs = jobs or []

    def list_records(self, *_args, **_kwargs):
        return self.jobs


def test_a1s_dry_run_lists_active_jobs_and_live_skips_them(monkeypatch):
    import a1s.processor as a1s_processor

    monkeypatch.setattr(a1s_processor, "GoogleDriveClient", _FakeDrive)
    monkeypatch.setattr(a1s_processor, "AirtableClient", lambda: _FakeAirtable())
    monkeypatch.setattr(a1s_processor, "pipeline_settings", lambda _client=None: _FakeSettings())
    preview = process_request(drive_file_id="drive-file", dry_run=True)
    assert preview["dry_run"] is True
    assert preview["eligible"][0]["id"] == "drive-file"

    monkeypatch.setattr(a1s_processor, "AirtableClient", lambda: _FakeAirtable(jobs=[{"id": "recJOB"}]))
    listed = process_request(drive_file_id="drive-file", dry_run=True)
    assert listed["eligible"][0]["id"] == "drive-file"
    assert listed["skipped"] == []

    live = process_request(drive_file_id="drive-file", inline=True)
    assert live["skipped"][0]["reason"] == "active_job"


class _TwoFileDrive:
    def list_files(self, **_kwargs):
        return [
            _file(id="big", name="IMG_BIG.MOV", size="2000000000"),
            _file(id="small", name="IMG_SMALL.MOV", size="120000000"),
        ]


def test_folder_scan_starts_smallest_only(monkeypatch):
    import a1s.processor as a1s_processor

    monkeypatch.setattr(a1s_processor, "GoogleDriveClient", _TwoFileDrive)
    monkeypatch.setattr(a1s_processor, "AirtableClient", lambda: _FakeAirtable())
    monkeypatch.setattr(a1s_processor, "pipeline_settings", lambda _client=None: _FakeSettings())
    monkeypatch.setattr(a1s_processor, "_any_active_a1_job", lambda _client: False)
    monkeypatch.setattr(a1s_processor, "_create_state", lambda *_args, **_kwargs: "recSTATE")
    monkeypatch.setattr(
        a1s_processor,
        "_compress_one",
        lambda file, **_kwargs: {
            "file_id": file["id"],
            "name": file["name"],
            "status": "started",
        },
    )
    result = process_request(inline=True)
    assert result["processed"] is True
    assert result["serialized"] is True
    assert result["started_count"] == 1
    assert result["started"][0]["name"] == "IMG_SMALL.MOV"


def test_live_status_reads_compressor_progress(monkeypatch):
    import a1s.processor as a1s_processor

    class _JobAirtable:
        def list_records(self, *_args, **_kwargs):
            return [{
                "id": "recJOB",
                "fields": {
                    "Setting_Name": "A1_JOB_drive1",
                    "Setting_Value": f"compressing|job-1|1|drive1||IMG_6131.MOV|123|{iso_ms()}",
                    "Notes": "old note",
                },
            }]

    monkeypatch.setattr(a1s_processor, "AirtableClient", _JobAirtable)
    monkeypatch.setattr(a1s_processor, "list_health_jobs", lambda: [])
    monkeypatch.setattr(
        a1s_processor,
        "poll_job",
        lambda _job_id: {"job_id": "job-1", "status": "compressing", "progress": 42},
    )
    monkeypatch.setattr(a1s_processor, "resume_active_jobs", lambda _client=None: [])
    result = process_request(live_status=True)
    assert result["live_status"] is True
    assert result["jobs"][0]["progress"] == 42
    assert result["jobs"][0]["detail"] == "Compressing IMG_6131.MOV · 42%"


def test_folder_scan_waits_when_another_job_is_active(monkeypatch):
    import a1s.processor as a1s_processor

    monkeypatch.setattr(a1s_processor, "GoogleDriveClient", _TwoFileDrive)
    monkeypatch.setattr(a1s_processor, "AirtableClient", lambda: _FakeAirtable())
    monkeypatch.setattr(a1s_processor, "pipeline_settings", lambda _client=None: _FakeSettings())
    monkeypatch.setattr(a1s_processor, "_any_active_a1_job", lambda _client: True)
    monkeypatch.setattr(a1s_processor, "resume_active_jobs", lambda _client=None: [{"id": "recJOB"}])
    result = process_request(inline=True)
    assert result["processed"] is False
    assert result["reason"] == "active_compression_in_progress"
    assert result["started_count"] == 0
    assert result["queued_count"] == 2
    assert result["resumed_count"] == 1
