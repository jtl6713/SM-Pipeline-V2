from __future__ import annotations

from typing import Any

from studio_compress.ame_encoder import AmeNotReady
from studio_compress.processor import (
    compress_pending_assets,
    MAX_COMPRESSED_BYTES,
    needs_compress,
    studio_master_download_url,
    studio_drive_download_url,
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


def test_compress_pending_assets_promotes_vibe_cut_master_ready():
    client = FakeAirtable(
        _request(
            [
                {
                    "id": "vid1",
                    "name": "long.mp4",
                    "media_kind": "video",
                    "size_bytes": 150 * 1024 * 1024,
                    "r2_key": "studio/master-assets/recPR/vid1-long.mp4",
                    "compression_status": "pending",
                }
            ],
            finished=False,
        )
    )
    client.record["fields"]["Production_Notes"] = "origin=ez-wizard; ez-input=vibe-cut"

    def submit_job(*_args, **_kwargs):
        return {"job_id": "job-vibe", "status": "queued"}

    def poll_job(_job_id: str) -> dict[str, Any]:
        return {
            "job_id": "job-vibe",
            "status": "complete",
            "progress": 100,
            "ok": True,
            "output_url": "http://127.0.0.1:3335/files/job-vibe/long_compressed.mp4",
            "output_size_bytes": 40_000_000,
        }

    result = compress_pending_assets(
        client,
        "recPRCompress",
        submit_job=submit_job,
        poll_job=poll_job,
        download_output=lambda _job: (b"vibe-mp4", "video/mp4"),
        stage_preview=lambda request_id, asset_id, _content: (
            f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"
        ),
        sleep=lambda _seconds: None,
    )
    assert result["finished_video_ready"] is True
    assert client.record["fields"]["Studio_Master_Asset_Status"] == "Ready"


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


def _pending_client() -> FakeAirtable:
    return FakeAirtable(
        _request(
            [
                {
                    "id": "vid1",
                    "name": "long.mp4",
                    "media_kind": "video",
                    "size_bytes": 150 * 1024 * 1024,
                    "r2_key": "studio/master-assets/recPR/vid1-long.mp4",
                    "compression_status": "pending",
                }
            ],
            finished=False,
        )
    )


def test_ame_output_is_staged_without_calling_ffmpeg():
    client = _pending_client()
    client.record["fields"]["Production_Notes"] = "origin=ez-wizard; ez-input=vibe-cut"
    submitted: list[str] = []

    def ame_encode(asset, on_progress):
        assert asset["id"] == "vid1"
        on_progress(40)
        return b"ame-encoded-mp4"

    result = compress_pending_assets(
        client,
        "recPRCompress",
        ame_encode=ame_encode,
        submit_job=lambda *_args, **_kwargs: submitted.append("ffmpeg"),
        poll_job=lambda _job_id: {"status": "complete", "ok": True},
        download_output=lambda _job: (b"ffmpeg-should-not-run", "video/mp4"),
        stage_preview=lambda request_id, asset_id, _content: (
            f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"
        ),
        sleep=lambda _seconds: None,
    )
    import json

    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert result["compressed"] == 1
    assert result["finished_video_ready"] is True
    assert submitted == []
    assert asset["compression_provider"] == "adobe-media-encoder"
    assert asset["compression_status"] == "ready"
    assert asset["url"].endswith("/vid1.mp4")
    assert asset["size_bytes"] == len(b"ame-encoded-mp4")


def test_ame_not_ready_falls_back_to_ffmpeg():
    client = _pending_client()
    submitted: list[str] = []

    def ame_encode(_asset, _on_progress):
        raise AmeNotReady("Media Encoder did not pick up the inbox file")

    def submit_job(*_args, **_kwargs):
        submitted.append("ffmpeg")
        return {"job_id": "job-fallback", "status": "complete", "ok": True, "output_size_bytes": 12}

    result = compress_pending_assets(
        client,
        "recPRCompress",
        ame_encode=ame_encode,
        submit_job=submit_job,
        poll_job=lambda job_id: {
            "job_id": job_id,
            "status": "complete",
            "ok": True,
            "output_size_bytes": 12,
        },
        download_output=lambda _job: (b"ffmpeg-mp4", "video/mp4"),
        stage_preview=lambda request_id, asset_id, _content: (
            f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"
        ),
        sleep=lambda _seconds: None,
    )
    import json

    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert result["ok"] is True
    assert submitted == ["ffmpeg"]
    assert asset["compression_provider"] == "ffmpeg"
    assert asset["compression_job_id"] == "job-fallback"


def _drive_only_client() -> FakeAirtable:
    """Exact failure shape: Chicago: Life Along the Waterfront, clip #8."""
    return FakeAirtable(_request([{
        "id": "59a9b4d684904e5382",
        "name": "Navy Pier Fireworks 12.mp4",
        "media_kind": "video",
        "mime_type": "video/mp4",
        "size_bytes": 118105125,
        "r2_key": None,
        "authoritative_storage": "google_drive",
        "staging_deleted": True,
        "google_drive_file_id": "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr",
        "media_asset_record_id": "recByWv7yDeVi2NPE",
        "compression_status": "failed",
        "compression_needed": True,
        "compression_error": "Studio compression needs a private studio/master-assets key",
    }], finished=False))


def test_chicago_waterfront_drive_original_uses_ame_first_without_ffmpeg():
    import json

    client = _drive_only_client()
    submitted = []
    def ame_encode(asset, on_progress):
        assert asset["r2_key"] is None
        assert asset["google_drive_file_id"] == "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"
        on_progress(35)
        return b"AME-encoded-private-original"

    outcome = compress_pending_assets(
        client, "recPRCompress",
        ame_encode=ame_encode,
        submit_job=lambda *_a: submitted.append("ffmpeg-public"),
        poll_job=lambda *_a: {},
        download_output=lambda *_a: (b"ffmpeg", "video/mp4"),
        stage_preview=lambda request_id, asset_id, content: (
            f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"
        ),
        sleep=lambda _s: None,
    )
    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert outcome["ok"] is True
    assert outcome["compressed"] == 1
    assert submitted == []
    assert asset["compression_provider"] == "adobe-media-encoder"
    assert asset["compression_status"] == "ready"
    assert asset["original_r2_key"] == ""
    assert asset["google_drive_file_id"] == "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"


def test_chicago_waterfront_ame_unavailable_falls_back_to_private_drive_not_public_url():
    import json

    client = _drive_only_client()
    submissions = []

    def ame_encode(_asset, _on_progress):
        raise AmeNotReady("Media Encoder did not pick up the inbox file")

    def submit_job(url, name, record_id):
        submissions.append((url, name, record_id))
        return {"job_id": "ffmpeg-private-job", "status": "complete", "ok": True, "output_size_bytes": 34}

    result = compress_pending_assets(
        client, "recPRCompress",
        ame_encode=ame_encode,
        submit_job=submit_job,
        poll_job=lambda *_args: {"status": "complete", "ok": True},
        download_output=lambda *_args: (b"ffmpeg-private-output", "video/mp4"),
        stage_preview=lambda request_id, asset_id, _content: (
            f"https://media.chicagoshining.com/studio/previews/finished-video/{request_id}/{asset_id}.mp4"
        ),
        sleep=lambda _s: None,
    )
    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert result["ok"] is True
    assert submissions == [(
        "http://127.0.0.1:3350/internal/drive-media/1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr",
        "Navy Pier Fireworks 12.mp4",
        "studio-recPRCompress-59a9b4d684904e5382",
    )]
    assert asset["compression_provider"] == "ffmpeg"
    assert asset["compression_status"] == "ready"
    assert asset["google_drive_file_id"] == "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"


def test_drive_fallback_url_rejects_arbitrary_urls_and_path_traversal():
    assert studio_drive_download_url("1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr") == (
        "http://127.0.0.1:3350/internal/drive-media/1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"
    )
    import pytest
    with pytest.raises(RuntimeError, match="Invalid authoritative"):
        studio_drive_download_url("../../etc/passwd")
    with pytest.raises(RuntimeError, match="Invalid authoritative"):
        studio_drive_download_url("https://drive.google.com/file/d/public/view")


class _OversizeBytes(bytes):
    def __len__(self):
        return MAX_COMPRESSED_BYTES + 1


def test_ame_output_larger_than_target_is_rejected_and_ffmpeg_finishes():
    import json
    client = _drive_only_client()
    attempts = []
    stages = []

    def ame_encode(asset, on_progress):
        on_progress(100)
        attempts.append("ame")
        return _OversizeBytes(b"oversized-AME")

    def submit(url, name, record_id):
        attempts.append("ffmpeg")
        assert "/internal/drive-media/" in url
        return {"job_id": "rescue", "status": "complete", "ok": True, "output_size_bytes": 25}

    result = compress_pending_assets(
        client, "recPRCompress", ame_encode=ame_encode,
        submit_job=submit, poll_job=lambda *_a: {},
        download_output=lambda *_a: (b"safe-small-preview", "video/mp4"),
        stage_preview=lambda _request, _asset, content: (
            stages.append(content) or "https://media.chicagoshining.com/studio/previews/finished-video/r/a.mp4"
        ),
        sleep=lambda _: None,
    )
    saved = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert result["ok"]
    assert attempts == ["ame", "ffmpeg"]
    assert stages == [b"safe-small-preview"]
    assert saved["compression_status"] == "ready"
    assert saved["compression_provider"] == "ffmpeg"
    assert saved["original_size_bytes"] == 118105125


def test_legacy_ready_147mb_ame_clip_skips_reencoding_and_recovers_with_ffmpeg():
    import json

    client = _drive_only_client()
    assets = list(client.record["fields"]["Studio_Master_Assets_JSON"])
    assets[0].update({
        "compression_status": "ready",
        "compression_needed": False,
        "compression_provider": "adobe-media-encoder",
        "compression_job_id": "ame-59a9b4d684904e5382",
        "size_bytes": 147069566,
        "original_size_bytes": 118105125,
        "preview_public_url": "https://media.chicagoshining.com/studio/previews/finished-video/recZKifUsQgTQBwbR/59a9b4d684904e5382.mp4",
    })
    client.record["fields"]["Studio_Master_Assets_JSON"] = json.dumps(assets)
    assert needs_compress(assets[0])
    stages = []
    result = compress_pending_assets(
        client, "recPRCompress",
        ame_encode=lambda *_args: (_ for _ in ()).throw(AssertionError("AME should not re-encode the oversized result")),
        submit_job=lambda url, *_args: (
            {"job_id": "ffmpeg-rescue", "status": "complete", "ok": True, "output_size_bytes": 20}
            if "/internal/drive-media/" in url else (_ for _ in ()).throw(AssertionError("public URL"))
        ),
        poll_job=lambda *_args: {},
        download_output=lambda *_args: (b"smaller-preview", "video/mp4"),
        stage_preview=lambda _request, _asset, content: (
            stages.append(content) or "https://media.chicagoshining.com/studio/previews/finished-video/r/a.mp4"
        ),
        sleep=lambda _: None,
    )
    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert result["compressed"] == 1
    assert result["ok"]
    assert stages == [b"smaller-preview"]
    assert asset["compression_provider"] == "ffmpeg"
    assert asset["size_bytes"] == 20
    assert asset["google_drive_file_id"] == "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"


def test_ffmpeg_cannot_mark_oversized_result_ready():
    import json

    client = _drive_only_client()
    result = compress_pending_assets(
        client, "recPRCompress",
        ame_encode=lambda *_args: (_ for _ in ()).throw(AmeNotReady("not watching")),
        submit_job=lambda *_args: {"job_id": "ffmpeg-large", "status": "complete", "ok": True},
        poll_job=lambda *_args: {},
        download_output=lambda *_args: (_OversizeBytes(b"oversized-ffmpeg"), "video/mp4"),
        stage_preview=lambda *_args: (_ for _ in ()).throw(AssertionError("must not stage oversized output")),
        sleep=lambda _: None,
    )
    asset = json.loads(client.record["fields"]["Studio_Master_Assets_JSON"])[0]
    assert not result["ok"]
    assert asset["compression_status"] == "failed"
    assert "95 MiB" in asset["compression_error"]
    assert asset["google_drive_file_id"] == "1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr"
