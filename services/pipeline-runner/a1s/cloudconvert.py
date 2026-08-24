from __future__ import annotations

import math
import time
from collections.abc import Callable
from typing import Any

import requests

from asset.constants import (
    A1S_AUDIO_RESERVE_KBPS,
    A1S_METADATA_POLL_SECONDS,
    A1S_METADATA_WAIT_SECONDS,
    A1S_MIN_VIDEO_KBPS,
    A1S_TARGET_BYTES,
)
from item4.settings import pipeline_settings

CC_API = "https://us-east.api.cloudconvert.com/v2"
CC_SYNC = "https://sync.api.cloudconvert.com/v2"
UPLOAD_FILENAME = "source.mov"


def api_token() -> str:
    token = pipeline_settings().get("CLOUDCONVERT_API_TOKEN").strip()
    if not token:
        raise RuntimeError("CLOUDCONVERT_API_TOKEN is missing from Pipeline Settings")
    return token


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _unwrap(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else payload


def create_job(token: str, body: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{CC_API}/jobs",
        headers={**_auth(token), "Content-Type": "application/json"},
        json=body,
        timeout=60,
    )
    response.raise_for_status()
    return _unwrap(response.json())


def get_job(token: str, job_id: str, *, sync: bool = False) -> dict[str, Any]:
    host = CC_SYNC if sync else CC_API
    response = requests.get(
        f"{host}/jobs/{job_id}",
        headers=_auth(token),
        timeout=60,
    )
    response.raise_for_status()
    return _unwrap(response.json())


def import_form(job: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    for task in job.get("tasks") or []:
        name = str(task.get("name") or "")
        operation = str(task.get("operation") or "")
        if name != "import-source" and operation != "import/upload":
            continue
        form = (task.get("result") or {}).get("form") or {}
        url = str(form.get("url") or "")
        parameters = form.get("parameters") if isinstance(form.get("parameters"), dict) else {}
        if url:
            return url, parameters
    raise RuntimeError("CloudConvert job missing import/upload form")


def upload_source(form_url: str, parameters: dict[str, Any], content: bytes) -> None:
    response = requests.post(
        form_url,
        data=parameters,
        files={"file": (UPLOAD_FILENAME, content, "application/octet-stream")},
        timeout=300,
    )
    response.raise_for_status()


def coerce_duration_seconds(raw: Any) -> float:
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip().replace(" s", "").replace("s", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_duration_seconds(job: dict[str, Any]) -> float:
    tasks = list(job.get("tasks") or [])
    candidates: list[dict[str, Any]] = []
    for task in tasks:
        name = str(task.get("name") or "")
        operation = str(task.get("operation") or "")
        if name == "metadata-source" or "metadata" in operation:
            candidates.append(task)
    if not candidates and len(tasks) > 1:
        candidates.append(tasks[1])
    for task in candidates:
        meta = (task.get("result") or {}).get("metadata") or {}
        raw = meta.get("Duration")
        if raw is None:
            raw = meta.get("duration")
        seconds = coerce_duration_seconds(raw)
        if seconds > 0:
            return seconds
    return 0.0


def target_video_kbps(duration_seconds: float) -> int:
    if duration_seconds <= 0:
        raise ValueError("duration must be greater than 0")
    return max(
        A1S_MIN_VIDEO_KBPS,
        math.floor((A1S_TARGET_BYTES * 8 / duration_seconds / 1000) - A1S_AUDIO_RESERVE_KBPS),
    )


def metadata_job_body(file_id: str) -> dict[str, Any]:
    return {
        "tag": f"A1M|{file_id}",
        "tasks": {
            "import-source": {"operation": "import/upload"},
            "metadata-source": {
                "operation": "metadata",
                "input": "import-source",
                "timeout": 600,
            },
        },
    }


def compress_job_body(file_id: str, kbps: int) -> dict[str, Any]:
    arguments = (
        f"-i /input/import-source/{UPLOAD_FILENAME} -map 0:v:0 -map 0:a:0? -sn -dn "
        f"-c:v libx265 -preset medium -b:v {kbps}k -maxrate {kbps}k -bufsize {kbps * 2}k "
        f"-c:a aac -b:a 96k -movflags +faststart /output/compressed.mp4"
    )
    return {
        "tag": f"A1|{file_id}",
        "tasks": {
            "import-source": {"operation": "import/upload"},
            "compress-video": {
                "operation": "command",
                "input": "import-source",
                "engine": "ffmpeg",
                "capture_output": True,
                "command": "ffmpeg",
                "arguments": arguments,
                "timeout": 7200,
            },
            "export-result": {
                "operation": "export/url",
                "input": "compress-video",
                "inline": False,
                "archive_multiple_files": False,
            },
        },
    }


def wait_for_job(
    token: str,
    job_id: str,
    *,
    timeout_seconds: int = A1S_METADATA_WAIT_SECONDS,
    interval_seconds: int = A1S_METADATA_POLL_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
    sync: bool = True,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last = get_job(token, job_id, sync=sync)
        status = str(last.get("status") or "").strip().lower()
        if status in {"finished", "error"}:
            return last
        sleep(interval_seconds)
    return last


def probe_duration(
    token: str,
    file_id: str,
    content: bytes,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[float, str]:
    job = create_job(token, metadata_job_body(file_id))
    job_id = str(job.get("id") or "")
    if not job_id:
        raise RuntimeError("CloudConvert metadata job did not return an id")
    form_url, parameters = import_form(job)
    upload_source(form_url, parameters, content)
    finished = wait_for_job(token, job_id, sleep=sleep)
    status = str(finished.get("status") or "").strip().lower()
    if status == "error":
        raise RuntimeError(f"CloudConvert metadata job {job_id} failed")
    duration = parse_duration_seconds(finished)
    if duration <= 0:
        raise RuntimeError(f"CloudConvert metadata job {job_id} did not return a positive duration")
    return duration, job_id
