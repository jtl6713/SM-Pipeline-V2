"""Async Studio Asset Manager ingest jobs.

Cloudflare Worker → runner (and the public tunnel) cannot hold one HTTP
request open for screen + Chicago watermark + Drive put. Accept the bytes,
return a job id immediately, and let the Worker poll short GETs until the
catalog-ready result exists.
"""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any

_LOCK = threading.Lock()
_JOBS: dict[str, dict[str, Any]] = {}
_TTL_SEC = 900


def _prune_locked(now: float) -> None:
    dead = [
        key
        for key, job in _JOBS.items()
        if now - float(job.get("updated_at") or 0) > _TTL_SEC
    ]
    for key in dead:
        _JOBS.pop(key, None)


def start_library_ingest_job(
    *,
    content: bytes,
    filename: str,
    mime_type: str = "",
    profile_name: str = "",
    skip_source_master: bool = False,
) -> str:
    job_id = uuid.uuid4().hex
    now = time.time()
    with _LOCK:
        _prune_locked(now)
        _JOBS[job_id] = {
            "job_id": job_id,
            "status": "processing",
            "updated_at": now,
        }

    # Copy once so the request buffer can be released while the worker runs.
    payload = bytes(content or b"")

    def _run() -> None:
        from studio_library.processor import ingest_studio_library_asset

        try:
            result = ingest_studio_library_asset(
                content=payload,
                filename=filename,
                mime_type=mime_type,
                profile_name=profile_name,
                skip_source_master=skip_source_master,
            )
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "status": "ok",
                    "updated_at": time.time(),
                    "result": result,
                }
        except ValueError as exc:
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "status": "error",
                    "updated_at": time.time(),
                    "error": str(exc),
                    "http_status": 422,
                }
        except Exception as exc:  # noqa: BLE001 — surface to Worker as 502 body
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "status": "error",
                    "updated_at": time.time(),
                    "error": str(exc),
                    "http_status": 502,
                }

    threading.Thread(
        target=_run,
        daemon=True,
        name=f"studio-asset-library-{job_id[:8]}",
    ).start()
    return job_id


def get_library_ingest_job(job_id: str) -> dict[str, Any] | None:
    key = str(job_id or "").strip()
    if not key:
        return None
    now = time.time()
    with _LOCK:
        _prune_locked(now)
        job = _JOBS.get(key)
        return dict(job) if job else None
