"""Parse and rebuild A1 job rows stored on Pipeline Settings."""

from __future__ import annotations

from typing import Any

from a1s.compressor import _job_url
from asset.constants import (
    A1P_DEAD_JOB_SECONDS,
    A1P_FINALIZE_LOCK_SECONDS,
    A1P_STALE_RESUME_SECONDS,
)
from carousel.timeutil import parse_utc, utc_now


ACTIVE_COMPRESSOR_STATUSES = {"queued", "downloading", "compressing", "starting", "processing_local"}


def parse_job_value(value: str) -> dict[str, str]:
    parts = str(value or "").split("|")
    name = ""
    file_id = ""
    if len(parts) >= 8:
        file_id = str(parts[3] or "").strip()
        name = str(parts[5] or "").strip()
    else:
        file_id = str(parts[3] or "").strip() if len(parts) > 3 else ""
        name = next((part for part in parts if str(part).lower().endswith((".mov", ".mp4", ".m4v", ".webm"))), "")
    return {
        "phase": str(parts[0] or "").strip().lower(),
        "job_id": str(parts[1] or "").strip() if len(parts) > 1 else "",
        "attempt": str(parts[2] or "").strip() if len(parts) > 2 else "",
        "file_id": file_id,
        "permission_id": str(parts[4] or "").strip() if len(parts) > 4 else "",
        "name": name,
        "size": str(parts[6] or "").strip() if len(parts) > 6 else "",
        "updated_at": str(parts[7] or "").strip() if len(parts) > 7 else "",
    }


def job_age_seconds(updated_at: str) -> float | None:
    parsed = parse_utc(updated_at)
    if parsed is None:
        return None
    return max(0.0, (utc_now() - parsed).total_seconds())


def payload_from_row(row: dict[str, Any], *, poller_url: str = "") -> dict[str, Any]:
    fields = row.get("fields") or {}
    parsed = parse_job_value(str(fields.get("Setting_Value") or ""))
    setting_name = str(fields.get("Setting_Name") or "")
    job_id = parsed["job_id"]
    file_id = parsed["file_id"] or setting_name.removeprefix("A1_JOB_")
    return {
        "job_id": job_id,
        "status_url": _job_url(job_id) if job_id else "",
        "state_record_id": str(row.get("id") or ""),
        "source_file_id": file_id,
        "source_name": parsed["name"],
        "source_size": parsed["size"],
        "permission_id": parsed["permission_id"],
        "attempt": parsed["attempt"] or "1",
        "poller_url": poller_url,
    }


def should_resume_job(parsed: dict[str, str], snapshot: dict[str, Any] | None) -> bool:
    if not parsed.get("job_id"):
        return False
    age = job_age_seconds(parsed.get("updated_at") or "")
    phase = str(parsed.get("phase") or "")
    if phase == "finalizing" and (age is None or age < A1P_FINALIZE_LOCK_SECONDS):
        return False
    status = str((snapshot or {}).get("status") or "").strip().lower()
    if status == "complete":
        return phase != "finalizing" or (age is not None and age >= A1P_FINALIZE_LOCK_SECONDS)
    if status in ACTIVE_COMPRESSOR_STATUSES:
        return age is not None and age >= A1P_STALE_RESUME_SECONDS
    if status in {"failed", "job_not_found", ""}:
        return age is not None and age >= min(A1P_STALE_RESUME_SECONDS, A1P_DEAD_JOB_SECONDS)
    return age is not None and age >= A1P_STALE_RESUME_SECONDS
