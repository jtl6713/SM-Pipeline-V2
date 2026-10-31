"""A1S processor — scan oversized Drive videos and start local compression."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from a1p.processor import resume_active_jobs, schedule_next
from a1p.state import parse_job_value
from a1s.compressor import delete_job, list_health_jobs, poll_job, submit_job
from a1s.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from a1s.eligibility import eligibility_reason
from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE, PIPELINE_SETTINGS_TABLE
from asset.constants import (
    A1S_DRIVE_PAGE_SIZE,
    A1S_JOB_NOTES,
    A1S_OVERSIZE_BYTES,
    GDRIVE_INGESTION_FOLDER,
)
from asset.helpers import parse_bytes, parse_int
from carousel.timeutil import iso_ms
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings

logger = logging.getLogger(__name__)
_START_LOCK = threading.Lock()

SCAN_QUERY = f"'{GDRIVE_INGESTION_FOLDER}' in parents and trashed = false and mimeType contains 'video/'"
SCAN_FIELDS = "files(id,name,mimeType,size,fileExtension,createdTime,videoMediaMetadata)"
FILE_FIELDS = "id,name,mimeType,size,fileExtension,createdTime,videoMediaMetadata,parents,trashed"


def _threshold(client: AirtableClient) -> int:
    raw = pipeline_settings(client).get("A1_COMPRESSION_THRESHOLD_BYTES")
    return parse_int(raw, A1S_OVERSIZE_BYTES) or A1S_OVERSIZE_BYTES


def _poller_url(client: AirtableClient) -> str:
    return pipeline_settings(client).get("A1_POLLER_WEBHOOK_URL").strip()


def _active_job(client: AirtableClient, file_id: str) -> dict[str, Any] | None:
    name = f"A1_JOB_{file_id}"
    formula = f"AND({{Active}}=1,{{Setting_Name}}='{name}')"
    rows = client.list_records(PIPELINE_SETTINGS_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def _any_active_a1_job(client: AirtableClient) -> bool:
    formula = "AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)"
    rows = client.list_records(PIPELINE_SETTINGS_TABLE, formula=formula, max_records=1)
    return bool(rows)


def _smallest_candidate(files: list[dict[str, Any]]) -> dict[str, Any]:
    # A new ingestion-folder upload should not starve behind historic library cleanup.
    return min(files, key=lambda item: (
        item.get("source_kind") != "ingestion",
        parse_bytes(item.get("size")),
        str(item.get("id") or ""),
    ))


def _parse_state_value(value: str) -> dict[str, str]:
    return parse_job_value(value)


def _progress_int(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return max(0, min(100, number))


def list_live_jobs(client: AirtableClient | None = None, *, resume: bool = True) -> list[dict[str, Any]]:
    airtable = client or AirtableClient()
    rows = airtable.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula="AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)",
        max_records=20,
    )
    health_jobs: list[dict[str, Any]] = []
    try:
        health_jobs = list_health_jobs()
    except Exception:
        logger.exception("A1S could not read compressor health jobs")
    health_by_id = {str(job.get("job_id") or ""): job for job in health_jobs if job.get("job_id")}
    health_by_name = {str(job.get("asset_name") or "").lower(): job for job in health_jobs if job.get("asset_name")}
    live: list[dict[str, Any]] = []
    for row in rows:
        fields = row.get("fields") or {}
        setting_name = str(fields.get("Setting_Name") or "")
        parsed = _parse_state_value(str(fields.get("Setting_Value") or ""))
        file_id = parsed["file_id"] or setting_name.removeprefix("A1_JOB_")
        name = parsed["name"] or file_id
        job_id = parsed["job_id"]
        snapshot: dict[str, Any] = {}
        if job_id:
            try:
                snapshot = poll_job(job_id)
            except Exception:
                logger.exception("A1S could not poll compressor job %s", job_id)
                snapshot = health_by_id.get(job_id) or {}
        if not snapshot:
            snapshot = health_by_name.get(name.lower()) or {}
        status = str(snapshot.get("status") or parsed["phase"] or "processing")
        progress = _progress_int(snapshot.get("progress"))
        label = {
            "queued": "Queued",
            "downloading": "Downloading",
            "compressing": "Compressing",
            "starting": "Starting",
            "processing_local": "Starting",
        }.get(status, "Compressing")
        detail = f"{label} {name}"
        if progress is not None:
            detail = f"{detail} · {progress}%"
        live.append(
            {
                "id": row.get("id"),
                "google_drive_file_id": file_id,
                "name": name,
                "job_id": job_id or snapshot.get("job_id") or "",
                "status": status,
                "progress": progress,
                "detail": detail,
                "notes": str(fields.get("Notes") or "") or None,
            }
        )
    if resume:
        try:
            resume_active_jobs(airtable)
        except Exception:
            logger.exception("A1S live status could not resume a stale compression job")
    return live


def _catalog_records(client: AirtableClient, threshold: int) -> list[dict[str, Any]]:
    """Read only currently oversized catalog videos; never infer identity by name."""
    formula = (
        f'AND({{File_Size_Bytes}}>{threshold},{{Active}}=1,'
        'OR({Media_Class}="Video",LEFT({MIME_Type}&"",6)="video/"),'
        '{Google Drive File ID}!="")'
    )
    return client.list_records(
        MEDIA_ASSETS_TABLE, formula=formula, max_records=200,
        fields=["Asset Name", "Google Drive File ID", "File_Size_Bytes", "MIME_Type"],
    )


def _catalog_source_ids(client: AirtableClient, threshold: int) -> dict[str, str]:
    """Ambiguous Drive IDs are never eligible for destructive or catalog updates."""
    found: dict[str, str] = {}
    ambiguous: set[str] = set()
    for row in _catalog_records(client, threshold):
        file_id = str((row.get("fields") or {}).get("Google Drive File ID") or "").strip()
        if not file_id:
            continue
        if file_id in found:
            ambiguous.add(file_id)
        else:
            found[file_id] = str(row.get("id") or "")
    return {key: value for key, value in found.items() if key not in ambiguous and value}


def _resolve_files(
    drive: GoogleDriveClient, drive_file_id: str | None, client: AirtableClient, threshold: int,
) -> list[dict[str, Any]]:
    # A targeted request must name either an ingestion-folder file or an actual
    # oversized catalog record. Reject arbitrary accessible Drive file IDs.
    catalog = _catalog_source_ids(client, threshold)
    if drive_file_id:
        item = drive.get_file(drive_file_id, fields=FILE_FIELDS)
        if GDRIVE_INGESTION_FOLDER in (item.get("parents") or []):
            return [{**item, "source_kind": "ingestion"}]
        if drive_file_id not in catalog:
            raise ValueError("Drive file is neither in ingestion nor an eligible oversized Media Asset")
        return [{**item, "source_kind": "asset_manager", "media_asset_record_id": catalog[drive_file_id]}]

    intake = drive.list_files(
        query=SCAN_QUERY, page_size=A1S_DRIVE_PAGE_SIZE,
        order_by="createdTime desc", fields=SCAN_FIELDS,
    )
    files_by_id = {str(row.get("id")): {**row, "source_kind": "ingestion"} for row in intake if row.get("id")}
    for file_id, record_id in catalog.items():
        if file_id in files_by_id:
            continue
        try:
            item = drive.get_file(file_id, fields=FILE_FIELDS)
        except Exception:
            logger.exception("A1S catalog Drive asset missing or inaccessible: %s", file_id)
            continue
        if item.get("trashed"):
            logger.warning("A1S skipped trashed catalog source %s", file_id)
            continue
        files_by_id[file_id] = {**item, "source_kind": "asset_manager", "media_asset_record_id": record_id}
    return list(files_by_id.values())


def _job_state_ids(client: AirtableClient) -> tuple[set[str], set[str]]:
    """One read for active locks and prior failures, to avoid Airtable cooldown."""
    rows = client.list_records(
        PIPELINE_SETTINGS_TABLE,
        formula="FIND('A1_JOB_',{Setting_Name})=1",
        max_records=150, fields=["Setting_Name", "Setting_Value", "Active"],
    )
    active: set[str] = set()
    failed: set[str] = set()
    for row in rows:
        fields = row.get("fields") or {}
        name = str(fields.get("Setting_Name") or "")
        if not name.startswith("A1_JOB_"):
            continue
        file_id = name[len("A1_JOB_"):]
        if fields.get("Active"):
            active.add(file_id)
        elif str(fields.get("Setting_Value") or "").startswith("failed_"):
            failed.add(file_id)
    return active, failed


def _write_state(client: AirtableClient, record_id: str, *, active: bool, value: str, notes: str) -> None:
    client.update_record(
        PIPELINE_SETTINGS_TABLE,
        record_id,
        {"Active": active, "Setting_Value": value, "Notes": notes},
    )


def _create_state(client: AirtableClient, *, file_id: str, name: str, size: int, value: str) -> str:
    # A manual retry reuses its prior inactive failed state instead of creating
    # a second Setting_Name row. Active records are never overwritten.
    old = client.list_records(PIPELINE_SETTINGS_TABLE,
        formula=f'{{Setting_Name}}="A1_JOB_{file_id}"', max_records=2)
    if len(old) > 1 or (old and (old[0].get("fields") or {}).get("Active")):
        return ""
    if old:
        client.update_record(PIPELINE_SETTINGS_TABLE, old[0]["id"], {
            "Active": True, "Setting_Value": value, "Notes": A1S_JOB_NOTES,
        })
        return str(old[0]["id"])
    created = client.create_records(
        PIPELINE_SETTINGS_TABLE,
        [
            {
                "Setting_Name": f"A1_JOB_{file_id}",
                "Active": True,
                "Setting_Value": value,
                "Notes": A1S_JOB_NOTES,
            }
        ],
        typecast=True,
    )
    return str(created[0]["id"]) if created else ""


def _clear_state(client: AirtableClient, record_id: str, *, value: str, notes: str) -> None:
    if not record_id:
        return
    try:
        # Retain an inactive failure record so automatic queue drains cannot
        # endlessly re-submit the same broken file.
        _write_state(client, record_id, active=False, value=value, notes=notes)
    except Exception:
        logger.exception("A1S failed to clear job state %s", record_id)


def _compress_one(
    file: dict[str, Any],
    *,
    state_record_id: str,
    poller_url: str,
    sleep: Callable[[float], None],
) -> dict[str, Any]:
    file_id = str(file.get("id") or "")
    name = str(file.get("name") or "")
    size = parse_bytes(file.get("size"))
    client = AirtableClient()
    job_id = ""
    try:
        job = submit_job(file_id, name)
        job_id = str(job.get("id") or "")
        if not job_id:
            job_id = str(job.get("job_id") or "")
        if not job_id:
            raise RuntimeError("Video Compressor did not return a job id")
        status_url = str(job.get("status_url") or "")
        now = iso_ms()
        value = f"processing_local|{job_id}|0|{file_id}||{name}|{size}|{now}"
        _write_state(
            client,
            state_record_id,
            active=True,
            value=value,
            notes=f"Starting compression for {name or 'video'}.",
        )
        schedule_next(
            {
                "job_id": job_id,
                "status_url": status_url,
                "state_record_id": state_record_id,
                "source_file_id": file_id,
                "source_name": name,
                "source_size": size,
                "permission_id": "",
                "attempt": "1",
                "poller_url": poller_url,
            }
        )
        return {
            "file_id": file_id,
            "name": name,
            "job_id": job_id,
            "state_record_id": state_record_id,
            "status_url": status_url,
            "status": "started",
            "backend": "local_video_compressor",
        }
    except Exception:
        if job_id:
            try:
                delete_job(job_id)
            except Exception:
                logger.exception("A1S could not clean up local compressor job %s", job_id)
        now = iso_ms()
        _clear_state(
            client,
            state_record_id,
            value=f"failed_start||0|{file_id}||{name}|{size}|{now}",
            notes="A1S failed before local compression started. Original preserved.",
        )
        raise


def process_request(
    *,
    drive_file_id: str | None = None,
    dry_run: bool = False,
    inline: bool = False,
    live_status: bool = False,
    sleep: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    if live_status:
        jobs = list_live_jobs()
        return {
            "processed": False,
            "dry_run": True,
            "live_status": True,
            "jobs": jobs,
            "started_count": 0,
        }
    # Serialize the preflight, Airtable lease creation, and job submission.
    # This protects against simultaneous Operations clicks and A2 cron pulses.
    if not dry_run and not _START_LOCK.acquire(blocking=False):
        return {"processed": False, "reason": "active_compression_in_progress",
                "started_count": 0, "queued_count": 0}
    try:
        return _process_scan(
            drive_file_id=drive_file_id, dry_run=dry_run, inline=inline, sleep=sleep,
        )
    finally:
        if not dry_run:
            _START_LOCK.release()


def _process_scan(*, drive_file_id: str | None, dry_run: bool, inline: bool,
                  sleep: Callable[[float], None] | None) -> dict[str, Any]:
    sleeper = sleep or ((lambda _seconds: None) if inline else time.sleep)
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "drive_file_id": drive_file_id,
    }
    client = AirtableClient()
    threshold = _threshold(client)
    drive = GoogleDriveClient()
    files = _resolve_files(drive, (drive_file_id or "").strip() or None, client, threshold)
    preview["file_ids"] = [str(item.get("id") or "") for item in files]
    preview["files_found"] = bool(files)
    preview["threshold_bytes"] = threshold
    poller_url = _poller_url(client)
    active_ids, failed_ids = _job_state_ids(client) if not dry_run else (set(), set())
    skipped: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for item in files:
        file_id = str(item.get("id") or "")
        has_job = file_id in active_ids
        reason = ("previous_failure_requires_review"
                  if file_id in failed_ids and not drive_file_id and not dry_run else None)
        reason = reason or eligibility_reason(
            item,
            threshold_bytes=threshold,
            has_active_job=has_job,
            check_job=not dry_run,
        )
        row = {"id": file_id, "name": item.get("name"), "size": parse_bytes(item.get("size"))}
        if reason:
            skipped.append({**row, "reason": reason})
            continue
        candidates.append(item)
    preview["skipped"] = skipped
    preview["skipped_count"] = len(skipped)
    if dry_run:
        preview["eligible"] = [
            {"id": item.get("id"), "name": item.get("name"), "size": parse_bytes(item.get("size")), "source_kind": item.get("source_kind")}
            for item in candidates
        ]
        return {"processed": False, "dry_run": True, **preview}
    if not candidates:
        return {"processed": False, "reason": "no_eligible_files", "started_count": 0, **preview}
    if active_ids:
        resumed = resume_active_jobs(client)
        return {
            "processed": False,
            "reason": "active_compression_in_progress",
            "started_count": 0,
            "queued_count": len(candidates),
            "resumed_count": len(resumed),
            "resumed": resumed,
            **preview,
        }
    targeted = bool((drive_file_id or "").strip())
    if not targeted:
        candidates = [_smallest_candidate(candidates)]
        preview["serialized"] = True

    started: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in candidates:
        file_id = str(item.get("id") or "")
        name = str(item.get("name") or "")
        size = parse_bytes(item.get("size"))
        now = iso_ms()
        state_id = _create_state(
            client,
            file_id=file_id,
            name=name,
            size=size,
            value=f"starting||0|{file_id}||{name}|{size}|{now}",
        )
        if not state_id:
            errors.append({"id": file_id, "reason": "state_create_failed"})
            continue
        if inline:
            try:
                started.append(_compress_one(item, state_record_id=state_id, poller_url=poller_url, sleep=sleeper))
            except Exception as exc:
                logger.exception("A1S inline compression failed for %s", file_id)
                errors.append({"id": file_id, "reason": str(exc)})
            continue

        def _run(current: dict[str, Any] = item, record_id: str = state_id) -> None:
            try:
                _compress_one(current, state_record_id=record_id, poller_url=poller_url, sleep=sleeper)
            except Exception:
                logger.exception("A1S background compression failed for %s", current.get("id"))

        threading.Thread(target=_run, daemon=True, name=f"a1s-{file_id}").start()
        started.append({"file_id": file_id, "name": name, "state_record_id": state_id, "status": "starting"})

    preview["started"] = started
    preview["started_count"] = len(started)
    preview["errors"] = errors
    if not started:
        return {"processed": False, "reason": "start_failed", **preview}
    return {"processed": True, **preview}
