"""A1M processor — probe oversized Drive video duration via CloudConvert (Make 5764543)."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from a1m.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from a1s.cloudconvert import api_token, probe_duration
from a1s.eligibility import eligibility_reason
from a1s.processor import _resolve_files, _threshold
from airtable.client import AirtableClient
from asset.helpers import parse_bytes
from integrations.google_drive import GoogleDriveClient

logger = logging.getLogger(__name__)


def _probe_one(file: dict[str, Any], *, sleep: Callable[[float], None]) -> dict[str, Any]:
    file_id = str(file.get("id") or "")
    drive = GoogleDriveClient()
    content, _mime = drive.download_file(file_id)
    duration, job_id = probe_duration(api_token(), file_id, content, sleep=sleep)
    return {
        "file_id": file_id,
        "name": file.get("name"),
        "duration_seconds": duration,
        "metadata_job_id": job_id,
        "status": "probed",
    }


def process_request(
    *,
    drive_file_id: str | None = None,
    dry_run: bool = False,
    inline: bool = False,
    sleep: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    sleeper = sleep or ((lambda _seconds: None) if inline else time.sleep)
    preview: dict[str, Any] = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "drive_file_id": drive_file_id,
    }
    drive = GoogleDriveClient()
    files = _resolve_files(drive, (drive_file_id or "").strip() or None)
    preview["file_ids"] = [str(item.get("id") or "") for item in files]
    preview["files_found"] = bool(files)
    client = AirtableClient()
    threshold = _threshold(client)
    preview["threshold_bytes"] = threshold
    skipped: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for item in files:
        reason = eligibility_reason(item, threshold_bytes=threshold, check_job=False)
        row = {"id": item.get("id"), "name": item.get("name"), "size": parse_bytes(item.get("size"))}
        if reason:
            skipped.append({**row, "reason": reason})
            continue
        candidates.append(item)
    preview["skipped"] = skipped
    preview["skipped_count"] = len(skipped)
    if dry_run:
        preview["eligible"] = [
            {"id": item.get("id"), "name": item.get("name"), "size": parse_bytes(item.get("size"))}
            for item in candidates
        ]
        return {"processed": False, "dry_run": True, "probed_count": 0, **preview}
    if not candidates:
        return {"processed": False, "reason": "no_eligible_files", "probed_count": 0, **preview}

    probed: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for item in candidates:
        file_id = str(item.get("id") or "")
        if inline:
            try:
                probed.append(_probe_one(item, sleep=sleeper))
            except Exception as exc:
                logger.exception("A1M inline probe failed for %s", file_id)
                errors.append({"id": file_id, "reason": str(exc)})
            continue

        def _run(current: dict[str, Any] = item) -> None:
            try:
                _probe_one(current, sleep=sleeper)
            except Exception:
                logger.exception("A1M background probe failed for %s", current.get("id"))

        threading.Thread(target=_run, daemon=True, name=f"a1m-{file_id}").start()
        probed.append({"file_id": file_id, "name": item.get("name"), "status": "starting"})

    preview["probed"] = probed
    preview["probed_count"] = len(probed)
    preview["errors"] = errors
    if not probed:
        return {"processed": False, "reason": "probe_failed", **preview}
    return {"processed": True, **preview}
