"""Path-confined scratch cleanup for local / cloud-vm media services.

Canonical copy: services/_shared/scratch_ttl.py
Windows Deploy-SMService copies only the service folder, so identical
vendored copies live next to frame-extractor, timing-engine, and
video-compressor, plus deploy/cloud-vm/scratch-ttl. Keep them byte-identical;
services/_shared/test_scratch_ttl.py enforces that.

Drive remains the DAM. This module only deletes working copies under an
explicit root (frames, compressor output, timing work, Remotion scratch).
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterable

JOB_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,200}$")
DEFAULT_MAX_JOBS = 50


def env_hours(name: str, default: float) -> float:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def is_safe_job_id(job_id: str) -> bool:
    if not job_id or ".." in job_id or "/" in job_id or "\\" in job_id:
        return False
    return bool(JOB_ID_RE.fullmatch(job_id))


def confined_path(root: Path, job_id: str) -> Path | None:
    if not is_safe_job_id(job_id):
        return None
    resolved_root = root.resolve()
    target = (resolved_root / job_id).resolve()
    try:
        target.relative_to(resolved_root)
    except ValueError:
        return None
    return target


def dir_stats(path: Path) -> tuple[int, int]:
    if not path.exists():
        return 0, 0
    if path.is_file():
        try:
            return 1, path.stat().st_size
        except OSError:
            return 0, 0
    files = 0
    bytes_ = 0
    for child in path.rglob("*"):
        if child.is_file():
            files += 1
            try:
                bytes_ += child.stat().st_size
            except OSError:
                pass
    return files, bytes_


def age_hours(path: Path) -> float | None:
    try:
        return max(0.0, (time.time() - path.stat().st_mtime) / 3600.0)
    except OSError:
        return None


def remove_job_dir(root: Path, job_id: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": True,
        "duplicate_safe": True,
        "job_id": job_id,
        "removed": False,
        "files": 0,
        "bytes": 0,
        "errors": [],
    }
    target = confined_path(root, job_id)
    if target is None:
        result["ok"] = False
        result["errors"].append("unsafe or invalid job id")
        return result
    if not target.exists():
        return result
    files, bytes_ = dir_stats(target)
    try:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        result["removed"] = True
        result["files"] = files
        result["bytes"] = bytes_
    except OSError as exc:
        result["ok"] = False
        result["errors"].append(str(exc))
    return result


def sweep_root(
    root: Path,
    *,
    ttl_hours: float,
    active_ids: Iterable[str] | None = None,
    max_jobs: int = DEFAULT_MAX_JOBS,
    dry_run: bool = False,
    files_as_jobs: bool = False,
) -> dict[str, Any]:
    resolved = root.resolve()
    result: dict[str, Any] = {
        "ok": True,
        "root": str(resolved),
        "ttl_hours": ttl_hours,
        "dry_run": dry_run,
        "removed": [],
        "selected": [],
        "skipped_active": [],
        "skipped_fresh": [],
        "errors": [],
        "files": 0,
        "bytes": 0,
    }
    active = {item for item in (active_ids or []) if item}
    if not resolved.exists():
        return result

    entries: list[Path] = []
    try:
        for child in resolved.iterdir():
            if files_as_jobs:
                if child.is_file() or child.is_dir():
                    entries.append(child)
            elif child.is_dir():
                entries.append(child)
    except OSError as exc:
        result["ok"] = False
        result["errors"].append(str(exc))
        return result

    entries.sort(key=lambda path: path.stat().st_mtime if path.exists() else 0)
    considered = 0
    for entry in entries:
        name = entry.name
        if not is_safe_job_id(name):
            continue
        if name in active:
            result["skipped_active"].append(name)
            continue
        age = age_hours(entry)
        if age is None or age < ttl_hours:
            result["skipped_fresh"].append(name)
            continue
        files, bytes_ = dir_stats(entry)
        if considered >= max_jobs:
            break
        item = {"job_id": name, "age_hours": round(age, 3), "files": files, "bytes": bytes_}
        result["selected"].append(item)
        considered += 1
        if dry_run:
            continue
        deleted = remove_job_dir(resolved, name)
        if deleted.get("removed"):
            result["removed"].append(item)
            result["files"] += files
            result["bytes"] += bytes_
        result["errors"].extend(deleted.get("errors") or [])

    result["ok"] = not result["errors"]
    return result


def start_hourly_sweep(run: Callable[[], dict[str, Any]], *, interval_seconds: int = 3600) -> threading.Thread:
    log = logging.getLogger("scratch-ttl")
    seconds = interval_seconds if interval_seconds >= 60 else 3600

    def loop() -> None:
        while True:
            time.sleep(seconds)
            try:
                result = run()
                log.info(
                    "scratch ttl sweep ok=%s files=%s bytes=%s",
                    result.get("ok"),
                    result.get("files"),
                    result.get("bytes"),
                )
            except Exception:
                log.exception("scratch ttl sweep failed")

    thread = threading.Thread(target=loop, name="scratch-ttl-sweep", daemon=True)
    thread.start()
    return thread
