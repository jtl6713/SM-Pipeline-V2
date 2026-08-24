"""A1P processor — CloudConvert poll / finalize (Make 5715500)."""

from __future__ import annotations

import re
import threading
import time
from typing import Any

import requests

from a1p.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from asset.constants import (
    A1P_MAX_ATTEMPTS,
    A1P_MAX_RESULT_BYTES,
    A1P_POLL_SLEEP_SECONDS,
    GDRIVE_INGESTION_FOLDER,
)
from asset.helpers import parse_int
from carousel.timeutil import iso_ms
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings


def _token() -> str:
    return pipeline_settings().get("CLOUDCONVERT_API_TOKEN").strip()


def _poll_job(job_id: str) -> dict[str, Any]:
    token = _token()
    if not token:
        raise RuntimeError("CLOUDCONVERT_API_TOKEN is missing from Pipeline Settings")
    response = requests.get(
        f"https://us-east.api.cloudconvert.com/v2/jobs/{job_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("data") if isinstance(payload.get("data"), dict) else payload


def _export_file(job: dict[str, Any]) -> tuple[str, int]:
    tasks = job.get("tasks") or []
    for task in tasks:
        if str(task.get("name") or "") != "export-result":
            continue
        files = ((task.get("result") or {}).get("files") or [])
        if files:
            url = str(files[0].get("url") or "")
            size = parse_int(files[0].get("size"), 0) or 0
            if url:
                return url, size
    raise RuntimeError("CloudConvert job finished without an export-result file")


def _compressed_names(source_name: str) -> tuple[str, str]:
    stem = re.sub(r"\.[^.]+$", "", source_name or "video")
    return f"{stem}_compressed", f"{stem}_compressed.mp4"


def _write_state(client: AirtableClient, record_id: str, *, active: bool, value: str, notes: str) -> None:
    client.update_record(
        PIPELINE_SETTINGS_TABLE,
        record_id,
        {
            "Active": active,
            "Setting_Value": value,
            "Notes": notes,
        },
    )


def _delete_state(client: AirtableClient, record_id: str) -> None:
    client.delete_record(PIPELINE_SETTINGS_TABLE, record_id)


def _schedule_next(payload: dict[str, Any]) -> None:
    poller_url = str(payload.get("poller_url") or "").strip()

    def _run() -> None:
        time.sleep(A1P_POLL_SLEEP_SECONDS)
        if poller_url:
            requests.post(poller_url, json=payload, timeout=60)
            return
        process_request(**{key: payload.get(key) for key in (
            "job_id",
            "state_record_id",
            "source_file_id",
            "source_name",
            "source_size",
            "permission_id",
            "attempt",
            "poller_url",
        )})

    threading.Thread(target=_run, daemon=True, name="a1p-poll").start()


def process_request(
    *,
    job_id: str | None = None,
    state_record_id: str | None = None,
    source_file_id: str | None = None,
    source_name: str | None = None,
    source_size: Any = None,
    permission_id: str | None = None,
    attempt: Any = None,
    poller_url: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    attempt_n = parse_int(attempt, 1) or 1
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "job_id": job_id,
        "state_record_id": state_record_id,
        "source_file_id": source_file_id,
        "source_name": source_name,
        "attempt": attempt_n,
    }
    if not job_id or not state_record_id:
        return {"processed": False, "reason": "missing_job_or_state", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    client = AirtableClient()
    job = _poll_job(job_id)
    status = str(job.get("status") or "").strip().lower()
    preview["cloudconvert_status"] = status
    now = iso_ms()

    if status in {"waiting", "processing"} and attempt_n < A1P_MAX_ATTEMPTS:
        value = f"processing|{job_id}|{attempt_n}|{source_file_id}|{permission_id}|{source_name}|{source_size}|{now}"
        _write_state(client, state_record_id, active=True, value=value, notes="CloudConvert still processing. Poller will retry in 60 seconds.")
        next_payload = {
            "job_id": job_id,
            "state_record_id": state_record_id,
            "source_file_id": source_file_id,
            "source_name": source_name,
            "source_size": source_size,
            "permission_id": permission_id,
            "attempt": attempt_n + 1,
            "poller_url": poller_url,
        }
        _schedule_next(next_payload)
        return {"processed": True, "deferred": True, "status": "processing", **preview}

    if status in {"waiting", "processing"}:
        value = f"timeout|{job_id}|{attempt_n}|{source_file_id}|{source_name}|{status}|{now}"
        _write_state(client, state_record_id, active=False, value=value, notes="Polling reached 10 attempts. Original preserved. Inspect the CloudConvert job.")
        _delete_state(client, state_record_id)
        return {"processed": True, "status": "timeout", **preview}

    if status == "error":
        value = f"failed_cloudconvert|{job_id}|{attempt_n}|{source_file_id}|{source_name}|{status}|{now}"
        _write_state(client, state_record_id, active=False, value=value, notes="CloudConvert returned an error. Original preserved.")
        _delete_state(client, state_record_id)
        return {"processed": True, "status": "failed_cloudconvert", **preview}

    if status != "finished":
        return {"processed": False, "reason": f"unexpected_status_{status}", **preview}

    export_url, result_size = _export_file(job)
    preview["result_size"] = result_size
    if result_size <= 0 or result_size > A1P_MAX_RESULT_BYTES:
        value = f"failed_result_too_large|{job_id}|{attempt_n}|{source_file_id}|{source_name}|{result_size}|{now}"
        _write_state(
            client,
            state_record_id,
            active=False,
            value=value,
            notes="Compressed output exceeded 90 MB or did not expose a valid size. Original preserved.",
        )
        _delete_state(client, state_record_id)
        return {"processed": True, "status": "failed_result_too_large", **preview}

    binary = requests.get(export_url, timeout=300)
    binary.raise_for_status()
    title, filename = _compressed_names(str(source_name or "video.mp4"))
    drive = GoogleDriveClient()
    uploaded = drive.upload_file(GDRIVE_INGESTION_FOLDER, filename, binary.content, "video/mp4")
    new_id = str(uploaded.get("id") or "")
    verified = drive.get_file(new_id, fields="id,name,mimeType,size,parents,trashed") if new_id else {}
    new_size = parse_int(verified.get("size"), 0) or 0
    if new_id and new_size > 0 and source_file_id:
        drive.delete_file(source_file_id)
    value = f"finished|{job_id}|{attempt_n}|{source_file_id}|{new_id}|{verified.get('name') or filename}|{new_size}|{now}"
    _write_state(
        client,
        state_record_id,
        active=False,
        value=value,
        notes="Replacement verified and original deleted. No public Drive permission was used.",
    )
    _delete_state(client, state_record_id)
    preview["new_file_id"] = new_id
    preview["new_name"] = title
    preview["new_size"] = new_size
    return {"processed": True, "status": "finished", **preview}
