"""Compress oversized Studio master videos without the Drive ingestion folder.

A1S/A1P remain intake-folder only. Studio keeps the original on private
STUDIO_MEDIA and replaces the playable URL with a compressed studio/previews/
copy after the local Video Compressor finishes.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any, Callable
from urllib.parse import quote

from a1s import compressor as compressor_api
from airtable.constants import PRODUCTION_REQUESTS_TABLE
from ap0.public_mp4 import (
    existing_finished_preview_url,
    finished_video_preview_key,
    is_public_finished_video_url,
    stage_finished_video_preview,
)
from item4.clip_poster import is_video_master_asset
from item4.sources import is_studio_master_key

logger = logging.getLogger("pipeline-runner.studio-compress")

THRESHOLD_BYTES = 100 * 1024 * 1024
MAX_WALL_SECONDS = 20 * 60
POLL_SLEEP_SECONDS = 4
LOOPBACK_BASE = os.environ.get("PIPELINE_RUNNER_LOOPBACK_URL", "http://127.0.0.1:3350").rstrip("/")

_RUNNING: set[str] = set()
_LOCK = threading.Lock()

SleepFn = Callable[[float], None]


def studio_master_download_url(r2_key: str) -> str:
    key = str(r2_key or "").strip()
    return f"{LOOPBACK_BASE}/internal/studio-master?key={quote(key, safe='')}"


def asset_size_bytes(asset: dict[str, Any] | None) -> int:
    try:
        return int((asset or {}).get("size_bytes") or 0)
    except (TypeError, ValueError):
        return 0


def is_finished_video_request(record: dict[str, Any] | None) -> bool:
    fields = (record or {}).get("fields") or {}
    notes = "\n".join(
        str(fields.get(name) or "")
        for name in (
            "Production_Notes",
            "Output_Notes",
            "Internal_Notes",
            "Production_Request_Notes",
        )
    ).lower()
    return "ez-input=finished-video" in notes


def compression_status(asset: dict[str, Any] | None) -> str:
    return str((asset or {}).get("compression_status") or "").strip().lower()


def needs_compress(asset: dict[str, Any] | None) -> bool:
    asset = asset or {}
    if not is_video_master_asset(asset):
        return False
    status = compression_status(asset)
    if status in {"ready", "skipped"}:
        return False
    if status in {"pending", "queued", "compressing", "downloading", "failed"}:
        return True
    if asset.get("compression_needed") is True:
        return True
    if asset_size_bytes(asset) <= THRESHOLD_BYTES:
        return False
    preview = str(asset.get("preview_public_url") or asset.get("url") or "")
    if is_public_finished_video_url(preview) and asset_size_bytes(asset) <= THRESHOLD_BYTES:
        return False
    return True


def load_assets(client: Any, record_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    record = client.get_record(PRODUCTION_REQUESTS_TABLE, record_id)
    raw = (record.get("fields") or {}).get("Studio_Master_Assets_JSON") or "[]"
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else list(raw or [])
    except Exception:
        parsed = []
    assets = [item for item in parsed if isinstance(item, dict)]
    return record, assets


def save_assets(
    client: Any,
    record_id: str,
    assets: list[dict[str, Any]],
    extra_fields: dict[str, Any] | None = None,
) -> None:
    fields: dict[str, Any] = {"Studio_Master_Assets_JSON": json.dumps(assets)}
    if extra_fields:
        fields.update(extra_fields)
    client.update_record(PRODUCTION_REQUESTS_TABLE, record_id, fields)


def patch_asset(
    assets: list[dict[str, Any]],
    asset_id: str,
    patch: dict[str, Any],
) -> list[dict[str, Any]]:
    next_assets: list[dict[str, Any]] = []
    for asset in assets:
        if str(asset.get("id") or "") == str(asset_id):
            next_assets.append({**asset, **patch})
        else:
            next_assets.append(asset)
    return next_assets


def start_job(production_request_record_id: str, source_asset_id: str = "") -> dict[str, Any]:
    request_id = str(production_request_record_id or "").strip()
    if not request_id.startswith("rec"):
        raise ValueError("production_request_record_id is required")
    launched = _launch(request_id, str(source_asset_id or "").strip())
    return {
        "accepted": True,
        "already_running": not launched,
        "production_request_record_id": request_id,
        "source_asset_id": str(source_asset_id or "").strip() or None,
    }


def _launch(request_id: str, source_asset_id: str) -> bool:
    with _LOCK:
        if request_id in _RUNNING:
            return False
        _RUNNING.add(request_id)
    thread = threading.Thread(
        target=_run_safe,
        args=(request_id, source_asset_id),
        daemon=True,
        name=f"studio-compress-{request_id}",
    )
    thread.start()
    return True


def _run_safe(request_id: str, source_asset_id: str) -> None:
    try:
        from airtable.client import AirtableClient

        compress_pending_assets(AirtableClient(), request_id, source_asset_id)
    except Exception:
        logger.exception("studio-compress crashed request=%s", request_id)
    finally:
        with _LOCK:
            _RUNNING.discard(request_id)


def compress_pending_assets(
    client: Any,
    record_id: str,
    source_asset_id: str = "",
    *,
    submit_job: Callable[..., dict[str, Any]] | None = None,
    poll_job: Callable[[str], dict[str, Any]] | None = None,
    download_output: Callable[[dict[str, Any]], tuple[bytes, str]] | None = None,
    stage_preview: Callable[[str, str, bytes], str] | None = None,
    sleep: SleepFn = time.sleep,
) -> dict[str, Any]:
    record, assets = load_assets(client, record_id)
    targets = [asset for asset in assets if needs_compress(asset)]
    wanted = str(source_asset_id or "").strip()
    if wanted:
        targets = [asset for asset in targets if str(asset.get("id") or "") == wanted]
    if not targets:
        return {"ok": True, "compressed": 0, "pending": 0, "already_ready": True}

    submit = submit_job or compressor_api.submit_download_job
    poll = poll_job or compressor_api.poll_job
    download = download_output or compressor_api.download_output
    stage = stage_preview or stage_finished_video_preview
    compressed = 0
    failed: list[str] = []
    for asset in targets:
        try:
            compress_one(
                client,
                record_id,
                asset,
                submit_job=submit,
                poll_job=poll,
                download_output=download,
                stage_preview=stage,
                sleep=sleep,
            )
            compressed += 1
        except Exception as exc:
            logger.exception(
                "studio-compress failed request=%s asset=%s",
                record_id,
                asset.get("id"),
            )
            failed.append(str(asset.get("id") or ""))
            record, assets = load_assets(client, record_id)
            save_assets(
                client,
                record_id,
                patch_asset(
                    assets,
                    str(asset.get("id") or ""),
                    {
                        "compression_status": "failed",
                        "compression_needed": True,
                        "compression_error": str(exc),
                    },
                ),
            )

    record, assets = load_assets(client, record_id)
    still_pending = [asset for asset in assets if needs_compress(asset)]
    extra: dict[str, Any] = {}
    if is_finished_video_request(record) and not still_pending and not failed:
        extra = {
            "Studio_Master_Asset_Status": "Ready",
            "Studio_Item4_State": "Assets Ready",
        }
        save_assets(client, record_id, assets, extra)
    return {
        "ok": not failed,
        "compressed": compressed,
        "pending": len(still_pending),
        "failed": failed,
        "finished_video_ready": bool(extra),
    }


def compress_one(
    client: Any,
    record_id: str,
    asset: dict[str, Any],
    *,
    submit_job: Callable[..., dict[str, Any]],
    poll_job: Callable[[str], dict[str, Any]],
    download_output: Callable[[dict[str, Any]], tuple[bytes, str]],
    stage_preview: Callable[[str, str, bytes], str],
    sleep: SleepFn = time.sleep,
) -> dict[str, Any]:
    asset_id = str(asset.get("id") or "").strip()
    r2_key = str(asset.get("r2_key") or "").strip()
    if not asset_id:
        raise RuntimeError("Master asset is missing an id")
    if not is_studio_master_key(r2_key):
        raise RuntimeError("Studio compression needs a private studio/master-assets key")

    record, assets = load_assets(client, record_id)
    job_id = str(asset.get("compression_job_id") or "").strip()
    job: dict[str, Any] | None = None
    if job_id:
        job = poll_job(job_id)
        status = str(job.get("status") or "").strip().lower()
        if status in {"failed", "error"} or job.get("ok") is False:
            job_id = ""
            job = None

    if not job_id:
        payload = submit_job(
            studio_master_download_url(r2_key),
            str(asset.get("name") or "video.mp4"),
            f"studio-{record_id}-{asset_id}",
        )
        job_id = str(payload.get("job_id") or "").strip()
        if not job_id:
            raise RuntimeError("Video Compressor submit did not return a job_id")
        assets = patch_asset(
            assets,
            asset_id,
            {
                "compression_status": "compressing",
                "compression_needed": True,
                "compression_job_id": job_id,
                "compression_error": None,
                "compression_progress": 0,
            },
        )
        save_assets(client, record_id, assets)
        job = payload

    started = time.monotonic()
    while str(job.get("status") or "").strip().lower() not in {"complete", "completed", "done"}:
        if time.monotonic() - started >= MAX_WALL_SECONDS:
            raise RuntimeError("Studio compression timed out")
        status = str(job.get("status") or "").strip().lower()
        if status in {"failed", "error"} or job.get("ok") is False:
            raise RuntimeError(str(job.get("error") or "Video Compressor failed"))
        progress = job.get("progress")
        record, assets = load_assets(client, record_id)
        save_assets(
            client,
            record_id,
            patch_asset(
                assets,
                asset_id,
                {
                    "compression_status": "compressing",
                    "compression_needed": True,
                    "compression_job_id": job_id,
                    "compression_progress": progress,
                },
            ),
        )
        sleep(POLL_SLEEP_SECONDS)
        job = poll_job(job_id)

    content, _mime = download_output(job)
    if not content:
        raise RuntimeError("Video Compressor returned an empty file")
    preview_url = stage_preview(record_id, asset_id, content)
    preview_key = finished_video_preview_key(record_id, asset_id)
    output_size = int(job.get("output_size_bytes") or len(content) or 0)
    original_size = asset_size_bytes(asset) or int(asset.get("original_size_bytes") or 0)
    record, assets = load_assets(client, record_id)
    save_assets(
        client,
        record_id,
        patch_asset(
            assets,
            asset_id,
            {
                "compression_status": "ready",
                "compression_needed": False,
                "compression_job_id": job_id,
                "compression_progress": 100,
                "compression_error": None,
                "original_size_bytes": original_size,
                "original_r2_key": r2_key,
                "size_bytes": output_size,
                "preview_r2_key": preview_key,
                "preview_public_url": preview_url,
                "url": preview_url,
                "mime_type": "video/mp4",
            },
        ),
    )
    return {
        "ok": True,
        "asset_id": asset_id,
        "preview_url": preview_url,
        "existing_preview": existing_finished_preview_url(asset) or None,
        "size_bytes": output_size,
    }
