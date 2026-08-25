from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote, urlparse

import requests

from asset.constants import A1S_TARGET_BYTES

DEFAULT_LOCAL_URL = "http://127.0.0.1:3335"
DEFAULT_PUBLIC_URL = "https://compress.chicagoshining.com"


def _base_url() -> str:
    return (os.environ.get("VIDEO_COMPRESSOR_URL") or DEFAULT_LOCAL_URL).strip().rstrip("/")


def _public_url() -> str:
    return (os.environ.get("VIDEO_COMPRESSOR_PUBLIC_URL") or DEFAULT_PUBLIC_URL).strip().rstrip("/")


def _headers() -> dict[str, str]:
    key = (os.environ.get("VIDEO_COMPRESSOR_API_KEY") or "").strip()
    return {"X-Compression-Key": key} if key else {}


def _origin(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    return parsed.scheme.lower(), parsed.netloc.lower()


def _managed_url(url: str, *, path_prefix: str) -> str:
    parsed = urlparse(str(url or ""))
    allowed_origins = {_origin(_base_url()), _origin(_public_url())}
    if _origin(url) not in allowed_origins or not parsed.path.startswith(path_prefix):
        raise RuntimeError("Video Compressor returned an untrusted URL")
    return str(url)


def _job_url(job_id: str) -> str:
    return f"{_base_url()}/jobs/{quote(job_id, safe='')}"


def target_mb() -> float:
    return A1S_TARGET_BYTES / 1024 / 1024


def submit_job(file_id: str, source_name: str) -> dict[str, Any]:
    response = requests.post(
        f"{_base_url()}/compress",
        headers=_headers(),
        json={
            "drive_file_id": file_id,
            "record_id": f"a1s-{file_id}",
            "asset_name": source_name,
            "target_mb": target_mb(),
            "max_width": 1080,
            "max_height": 1920,
            "audio_kbps": 96,
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    job_id = str(payload.get("job_id") or "").strip()
    status_url = str(payload.get("status_url") or "").strip()
    if response.status_code != 202 or not job_id or not status_url:
        raise RuntimeError("Video Compressor submit response was incomplete")
    _managed_url(status_url, path_prefix="/jobs/")
    return payload


def poll_job(job_id: str) -> dict[str, Any]:
    response = requests.get(_job_url(job_id), headers=_headers(), timeout=60)
    if response.status_code == 404:
        return {"ok": False, "job_id": job_id, "status": "failed", "error": "job_not_found"}
    response.raise_for_status()
    payload = response.json()
    if str(payload.get("job_id") or "") != job_id:
        raise RuntimeError("Video Compressor poll response did not match the requested job")
    return payload


def download_output(job: dict[str, Any]) -> tuple[bytes, str]:
    output_url = _managed_url(str(job.get("output_url") or ""), path_prefix="/files/")
    parsed = urlparse(output_url)
    local_url = f"{_base_url()}{parsed.path}"
    response = requests.get(local_url, timeout=300)
    response.raise_for_status()
    mime = response.headers.get("Content-Type", "video/mp4").split(";")[0].strip()
    return response.content, mime


def delete_job(job_id: str) -> None:
    response = requests.delete(_job_url(job_id), headers=_headers(), timeout=60)
    if response.status_code == 404:
        return
    response.raise_for_status()
