"""A1P processor — poll local compression and safely replace the Drive original."""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import Any

import requests

from a1p.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from a1p.state import parse_job_value, payload_from_row, should_resume_job
from a1s.compressor import delete_job, download_output, poll_job
from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from asset.constants import (
    A1P_MAX_RESULT_BYTES,
    A1P_POLL_SLEEP_SECONDS,
    GDRIVE_INGESTION_FOLDER,
)
from asset.helpers import parse_int
from carousel.timeutil import iso_ms
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings

logger = logging.getLogger(__name__)


def _compressed_names(source_name: str) -> tuple[str, str]:
    stem = re.sub(r"\.[^.]+$", "", source_name or "video")
    return f"{stem}_compressed", f"{stem}_compressed.mp4"


def _escape_drive_query(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


def _existing_output(drive: GoogleDriveClient, filename: str, expected_size: int) -> dict[str, Any]:
    escaped = _escape_drive_query(filename)
    rows = drive.list_files(
        query=(
            f"'{GDRIVE_INGESTION_FOLDER}' in parents and name = '{escaped}' "
            "and trashed = false"
        ),
        page_size=20,
        order_by="modifiedTime desc",
        fields="files(id,name,mimeType,size,parents,trashed,modifiedTime)",
    )
    for row in rows:
        if parse_int(row.get("size"), 0) == expected_size and str(row.get("mimeType") or "").startswith("video/"):
            return row
    return {}


def _cleanup_job(job_id: str) -> None:
    try:
        delete_job(job_id)
    except Exception:
        logger.exception("A1P could not clean up local compressor job %s", job_id)


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


def _poll_kwargs(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: payload.get(key) for key in (
        "job_id",
        "status_url",
        "state_record_id",
        "source_file_id",
        "source_name",
        "source_size",
        "permission_id",
        "attempt",
        "poller_url",
    )}


def schedule_next(payload: dict[str, Any], delay_seconds: float | None = None) -> None:
    poller_url = str(payload.get("poller_url") or "").strip()
    wait = A1P_POLL_SLEEP_SECONDS if delay_seconds is None else max(0.0, float(delay_seconds))

    def _run() -> None:
        if wait:
            time.sleep(wait)
        if poller_url:
            requests.post(poller_url, json=payload, timeout=60)
            return
        process_request(**_poll_kwargs(payload))

    threading.Thread(target=_run, daemon=True, name="a1p-poll").start()


_schedule_next = schedule_next


def _continue_after_finish() -> None:
    def _run() -> None:
        try:
            from a2.processor import process_request as process_a2

            process_a2(dry_run=False, trigger_a2b=True, wait_for_next=False)
        except Exception:
            logger.exception("A1P could not intake the compressed replacement")
        try:
            from a1s.processor import process_request as process_a1s

            process_a1s(inline=True)
        except Exception:
            logger.exception("A1P could not start the next oversized compression job")

    threading.Thread(target=_run, daemon=True, name="a1p-continue").start()


def resume_active_jobs(client: AirtableClient | None = None) -> list[dict[str, Any]]:
    airtable = client or AirtableClient()
    poller_url = str(pipeline_settings(airtable).get("A1_POLLER_WEBHOOK_URL") or "").strip()
    rows = airtable.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula="AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)",
        max_records=20,
    )
    kicked: list[dict[str, Any]] = []
    for row in rows:
        parsed_payload = payload_from_row(row, poller_url=poller_url)
        job_id = str(parsed_payload.get("job_id") or "")
        snapshot: dict[str, Any] = {}
        if job_id:
            try:
                snapshot = poll_job(job_id)
            except Exception:
                logger.exception("A1P resume could not poll compressor job %s", job_id)
                snapshot = {"status": "failed", "error": "poll_failed"}
        fields = row.get("fields") or {}
        parsed = parse_job_value(str(fields.get("Setting_Value") or ""))
        if not should_resume_job(parsed, snapshot):
            continue
        _schedule_next(parsed_payload, delay_seconds=0)
        kicked.append({"id": row.get("id"), "job_id": job_id, "status": snapshot.get("status") or parsed.get("phase")})
    return kicked


def process_request(
    *,
    job_id: str | None = None,
    status_url: str | None = None,
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
        "status_url": status_url,
        "state_record_id": state_record_id,
        "source_file_id": source_file_id,
        "source_name": source_name,
        "attempt": attempt_n,
    }
    if not job_id or not state_record_id:
        if dry_run:
            return {"processed": False, "dry_run": True, **preview}
        resumed = resume_active_jobs()
        return {
            "processed": bool(resumed),
            "status": "resumed" if resumed else "idle",
            "resumed_count": len(resumed),
            "resumed": resumed,
            **preview,
        }
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    client = AirtableClient()
    job = poll_job(job_id)
    status = str(job.get("status") or "").strip().lower()
    preview["compressor_status"] = status
    now = iso_ms()

    if status in {"queued", "downloading", "compressing"}:
        phase_label = {
            "queued": "Queued",
            "downloading": "Downloading",
            "compressing": "Compressing",
        }.get(status, "Compressing")
        progress = job.get("progress")
        try:
            progress_n = max(0, min(100, int(progress)))
        except (TypeError, ValueError):
            progress_n = None
        progress_note = f" · {progress_n}%" if progress_n is not None else ""
        value = f"{status}|{job_id}|{attempt_n}|{source_file_id}|{permission_id}|{source_name}|{source_size}|{now}"
        _write_state(
            client,
            state_record_id,
            active=True,
            value=value,
            notes=f"{phase_label} {source_name or 'video'}{progress_note}. Poller will retry in 60 seconds.",
        )
        next_payload = {
            "job_id": job_id,
            "status_url": status_url,
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

    if status == "failed":
        value = f"failed_local_compressor|{job_id}|{attempt_n}|{source_file_id}|{source_name}|{status}|{now}"
        _write_state(client, state_record_id, active=False, value=value, notes="Local compressor returned an error. Original preserved.")
        _delete_state(client, state_record_id)
        _cleanup_job(job_id)
        return {"processed": True, "status": "failed_local_compressor", **preview}

    if status != "complete":
        return {"processed": False, "reason": f"unexpected_status_{status}", **preview}

    lock_value = f"finalizing|{job_id}|{attempt_n}|{source_file_id}|{permission_id}|{source_name}|{source_size}|{now}"
    _write_state(
        client,
        state_record_id,
        active=True,
        value=lock_value,
        notes=f"Uploading compressed replacement for {source_name or 'video'}.",
    )

    result_size = parse_int(job.get("output_size_bytes"), 0) or 0
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
        _cleanup_job(job_id)
        return {"processed": True, "status": "failed_result_too_large", **preview}

    binary, output_mime = download_output(job)
    if len(binary) != result_size:
        raise RuntimeError("Downloaded compressor output size did not match the completed job")
    title, filename = _compressed_names(str(source_name or "video.mp4"))
    drive = GoogleDriveClient()
    existing = _existing_output(drive, filename, result_size)
    uploaded = existing or drive.upload_file(GDRIVE_INGESTION_FOLDER, filename, binary, output_mime or "video/mp4")
    new_id = str(uploaded.get("id") or "")
    verified = drive.get_file(new_id, fields="id,name,mimeType,size,parents,trashed") if new_id else {}
    new_size = parse_int(verified.get("size"), 0) or 0
    verified_parents = [str(value) for value in (verified.get("parents") or [])]
    if (
        not new_id
        or new_id == source_file_id
        or new_size != result_size
        or str(verified.get("mimeType") or "") != "video/mp4"
        or GDRIVE_INGESTION_FOLDER not in verified_parents
        or bool(verified.get("trashed"))
    ):
        raise RuntimeError("Compressed Drive replacement did not pass verification; original preserved")
    if source_file_id:
        source = drive.get_file(source_file_id, fields="id,parents,trashed")
        if not bool(source.get("trashed")):
            drive.trash_file(source_file_id)
        source_after = drive.get_file(source_file_id, fields="id,parents,trashed")
        if not bool(source_after.get("trashed")):
            raise RuntimeError("Compressed replacement verified but original could not be moved to trash")
    _cleanup_job(job_id)
    value = f"finished|{job_id}|{attempt_n}|{source_file_id}|{new_id}|{verified.get('name') or filename}|{new_size}|{now}"
    _write_state(
        client,
        state_record_id,
        active=False,
        value=value,
        notes="Replacement verified and original moved to Drive trash. No public Drive permission was used.",
    )
    _delete_state(client, state_record_id)
    preview["new_file_id"] = new_id
    preview["new_name"] = title
    preview["new_size"] = new_size
    preview["source_trashed"] = bool(source_file_id)
    preview["reused_existing_output"] = bool(existing)
    _continue_after_finish()
    return {"processed": True, "status": "finished", **preview}
