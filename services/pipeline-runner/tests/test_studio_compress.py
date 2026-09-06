from __future__ import annotations

from typing import Any

from studio_compress.processor import (
    compress_pending_assets,
    needs_compress,
    studio_master_download_url,
)


class FakeAirtable:
    def __init__(self, record: dict[str, Any]) -> None:
        self.record = record
        self.updates: list[dict[str, Any]] = []

    def get_record(self, _table, record_id):
        assert record_id == self.record["id"]
        return self.record

    def update_record(self, _table, record_id, fields):
        self.updates.append({"record_id": record_id, "fields": dict(fields)})
        current = dict(self.record.get("fields") or {})
        current.update(fields)
        self.record = {"id": record_id, "fields": current}
        return self.record


def _request(assets: list[dict[str, Any]], *, finished: bool = True) -> dict[str, Any]:
    notes = "origin=ez-wizard; ez-input=finished-video; ez-caption=ai" if finished else "origin=ez-wizard; ez-input=photos-and-clips"
    return {
        "id": "recPRCompress",
        "fields": {
            "Production_Notes": notes,
            "Studio_Master_Assets_JSON": assets,
        },
    }


def test_needs_compress_large_video_pending():
    asset = {
        "id": "vid1",
        "name": "summer.mp4",
        "media_kind": "video",
        "size_bytes": 150 * 1024 * 1024,
        "r2_key": "studio/master-assets/recPR/vid1-summer.mp4",
        "compression_status": "pending",
    }
    assert needs_compress(asset) is True


def test_needs_compress_skips_ready_and_photos():
    ready = {
        "id": "vid1",
        "media_kind": "video",
        "size_bytes": 40 * 1024 * 1024,
        "compression_status": "ready",
        "url": "https://media.chicagoshining.com/studio/previews/finished-video/recPR/vid1.mp4",
    }
    photo = {"id": "pic1", "media_kind": "photo", "size_bytes": 8 * 1024 * 1024}
    small = {
        "id": "vid2",
        "media_kind": "video",
        "size_bytes": 20 * 1024 * 1024,
        "r2_key": "studio/master-assets/recPR/vid2.mp4",
    }
    assert needs_compress(ready) is False
    assert needs_compress(photo) is False
    assert needs_compress(small) is False


def test_studio_master_download_url_encodes_key():
    url = studio_master_download_url("studio/master-assets/recPR/vid1-summer.mp4")
    assert url.startswith("http://127.0.0.1:3350/internal/studio-master?key=")
    assert "studio%2Fmaster-assets" in url


def test_compress_pending_assets_stages_preview_and_marks_ready():
    client = FakeAirtable(
        _request(
            [
                {
                    "id": "vid1",
                    "name": "summer.mp4",
                    "media_kind": "video",
                    "mime_type": "video/mp4",
                    "size_bytes": 150 * 1024 * 1024,
                    "r2_key": "studio/master-assets/recPRCompress/vid1-summer.mp4",
                    "compression_status": "pending",
                    "compression_needed": True,
                }
            ]
        )
    )
    submitted: list[dict[str, str]] = []
    staged: list[dict[str, Any]] = []

    def submit_job(download_url: str, source_name: str, record_id: str) -> dict[str, Any]:
        submitted.append({"download_url": download_url, "source_name": source_name, "record_id": record_id})
        return {
            "job_id": "job-studio-1",
            "status": "queued",
            "status_url": "http://127.0.0.1:3335/jobs/job-studio-1",
        }

    polls = {"count": 0}

    def poll_job(job_id: str) -> dict[str, Any]:
        polls["count"] += 1
        if polls["count"] < 2:
            return {"job_id": job_id, "status": "compressing", "progress": 40, "ok": True}
        return {
            "job_id": job_id,
            "status": "complete",
            "progress": 100,
            "ok": True,
            "output_url": "http://127.0.0.1:3335/files/job-studio-1/summer_compressed.mp4",
            "output_size_bytes": 42_000_000,
        }

    def download_output(_job: dict[str, Any]) -> tuple[bytes, str]:
        return b"compressed-mp4-bytes", "video/mp4"

    def stage_preview(request_id: str, asset_id: str, content: bytes) -> str:
        staged.append({"request_id": request_id, "asset_id": asset_id, "content": content})
        return f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"

    result = compress_pending_assets(
        client,
        "recPRCompress",
        submit_job=submit_job,
        poll_job=poll_job,
        download_output=download_output,
        stage_preview=stage_preview,
        sleep=lambda _seconds: None,
    )

    assert result["ok"] is True
    assert result["compressed"] == 1
    assert result["finished_video_ready"] is True
    assert submitted[0]["source_name"] == "summer.mp4"
    assert "internal/studio-master" in submitted[0]["download_url"]
    assert staged[0]["content"] == b"compressed-mp4-bytes"
    fields = client.record["fields"]
    assert fields["Studio_Master_Asset_Status"] == "Ready"
    import json

    assets = json.loads(fields["Studio_Master_Assets_JSON"])
    asset = assets[0]
    assert asset["compression_status"] == "ready"
    assert asset["size_bytes"] == 42_000_000
    assert asset["original_size_bytes"] == 150 * 1024 * 1024
    assert asset["url"].startswith("https://media.chicagoshining.com/studio/previews/finished-video/")
    assert "drive_file_id" not in submitted[0]


def test_submit_download_job_uses_url_not_drive(monkeypatch):
    import a1s.compressor as compressor

    captured: dict[str, Any] = []

    class Response:
        status_code = 202

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, Any]:
            return {
                "job_id": "job-dl",
                "status": "queued",
                "status_url": "http://127.0.0.1:3335/jobs/job-dl",
            }

    def fake_post(url, **kwargs):
        captured.append({"url": url, **kwargs})
        return Response()

    monkeypatch.setattr(compressor.requests, "post", fake_post)
    result = compressor.submit_download_job(
        "http://127.0.0.1:3350/internal/studio-master?key=studio%2Fmaster-assets%2FrecPR%2Fvid.mp4",
        "summer.mp4",
        "studio-recPR-vid1",
    )
    assert result["job_id"] == "job-dl"
    body = captured[0]["json"]
    assert body["download_url"].startswith("http://127.0.0.1:3350/internal/studio-master")
    assert "drive_file_id" not in body
    assert body["record_id"] == "studio-recPR-vid1"
