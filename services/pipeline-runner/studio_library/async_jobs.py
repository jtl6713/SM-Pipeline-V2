"""Async Studio Asset Manager ingest jobs.

Cloudflare Worker → runner (and the public tunnel) cannot hold one HTTP
request open for screen + Chicago watermark + Drive put. Accept the bytes,
return a job id immediately, and let the Worker poll short GETs until the
catalog-ready result exists.
"""

from __future__ import annotations

import hashlib
import threading
import time
import uuid
from typing import Any

_LOCK = threading.Lock()
_JOBS: dict[str, dict[str, Any]] = {}
_TTL_SEC = 900
_RECOVERY_MAX_PENDING = 3


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
    override_overlay_hold: bool = False,
) -> str:
    # Copy once so the request buffer can be released while the worker runs.
    payload = bytes(content or b"")
    # An override response can be lost after Drive succeeds. Reusing its active
    # or successful job prevents a retry from creating another Drive copy.
    # Match the actual media bytes and all fields influencing the output.
    fingerprint = (
        hashlib.sha256(payload).hexdigest(),
        str(filename or ""),
        str(mime_type or ""),
        str(profile_name or ""),
        bool(skip_source_master),
    ) if override_overlay_hold else None
    now = time.time()
    with _LOCK:
        _prune_locked(now)
        if fingerprint is not None:
            for existing in _JOBS.values():
                if (existing.get("_fingerprint") == fingerprint
                        and existing.get("status") in {"processing", "ok"}):
                    return str(existing["job_id"])
        from studio_produce import workload_governor as governor
        if governor.enabled() and governor.admission_paused():
            waiting = sum(1 for job in _JOBS.values() if job.get("status") == "processing")
            if waiting >= _RECOVERY_MAX_PENDING:
                raise RuntimeError("library_ingest_capacity")
        job_id = uuid.uuid4().hex
        _JOBS[job_id] = {
            "job_id": job_id,
            "status": "processing",
            "updated_at": now,
            "_fingerprint": fingerprint,
        }

    def _run() -> None:
        from studio_library.processor import ingest_studio_library_asset

        try:
            from contextlib import nullcontext
            from studio_produce import workload_governor as governor
            # Recovery allows *only* this single media-ingest resource.
            # Drive processing remains bounded while Supabase publishing,
            # Studio production and all other mutating runner routes stay paused.
            claim = (
                governor.resource_slot("library_image_upload", limit=1, allow_during_recovery=True)
                if governor.enabled() and governor.admission_paused()
                else nullcontext()
            )
            with claim:
                result = ingest_studio_library_asset(
                    content=payload,
                    filename=filename,
                    mime_type=mime_type,
                    profile_name=profile_name,
                    skip_source_master=skip_source_master,
                    override_overlay_hold=override_overlay_hold,
                )
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "_fingerprint": fingerprint,
                    "status": "ok",
                    "updated_at": time.time(),
                    "result": result,
                }
        except ValueError as exc:
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "_fingerprint": fingerprint,
                    "status": "error",
                    "updated_at": time.time(),
                    "error": str(exc),
                    "http_status": 422,
                }
        except Exception as exc:  # noqa: BLE001 — surface to Worker as 502 body
            with _LOCK:
                _JOBS[job_id] = {
                    "job_id": job_id,
                    "_fingerprint": fingerprint,
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
        # Keep the deduplication fingerprint internal; the API only needs job
        # state, errors and the original Drive receipt.
        return {k: v for k, v in job.items() if k != "_fingerprint"} if job else None
