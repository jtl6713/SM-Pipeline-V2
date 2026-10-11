"""Hand a Studio master to the local Adobe Media Encoder watch folder.

Studio downloads the private master and places a working copy in the matching
inbox. The AME bridge deletes that copy only after a validated output exists.
This module waits for that handoff and returns the encoded bytes.

If Media Encoder never picks the file up, the inbox copy is removed and
AmeNotReady is raised so Studio can use the existing FFmpeg compressor.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger("pipeline-runner.studio-compress.ame")

DEFAULT_ROOT = Path(r"D:\Content Creation\ChicagoShining Pipeline\Services\AME_Bridge")
DEFAULT_BRIDGE_URL = "http://127.0.0.1:3344"
MARKER_NAME = "bridge-root.json"
MARKER_ROLE = "ame-bridge-root"
MIN_OUTPUT_BYTES = 32 * 1024
PICKUP_SECONDS = 90
POLL_SECONDS = 5
SOURCE_GONE_GRACE_SECONDS = 20
PORTRAIT_PRESET = "social-standard-9x16"
LANDSCAPE_PRESET = "landscape-standard-16x9"
SOURCE_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".m4v",
    ".mxf",
    ".mts",
    ".m2ts",
    ".avi",
    ".mkv",
    ".wmv",
    ".mpg",
    ".mpeg",
}
OUTPUT_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mxf"}
_DUPLICATE_SUFFIX = re.compile(r"^(?P<base>.+)_(?P<index>\d+)$")

ProgressFn = Callable[[int], None]
FetchFn = Callable[[str, Path], None]
SleepFn = Callable[[float], None]
ClockFn = Callable[[], float]


class AmeNotReady(RuntimeError):
    """The bridge is down, or Media Encoder did not take the inbox copy."""


def bridge_is_ready(url: str | None = None, get: Callable[..., Any] | None = None) -> bool:
    import requests

    getter = get or requests.get
    health_url = f"{(url or os.environ.get('AME_BRIDGE_URL') or DEFAULT_BRIDGE_URL).rstrip('/')}/health"
    try:
        response = getter(health_url, timeout=2)
    except Exception:
        return False
    if getattr(response, "status_code", 0) != 200:
        return False
    try:
        body = response.json()
    except Exception:
        return False
    if not isinstance(body, dict):
        return False
    return (
        body.get("ok") is True
        and body.get("service") == "chicagoshining-ame-bridge"
        and body.get("delete_watch_source") is True
    )


def preset_for_asset(asset: dict[str, Any]) -> str:
    try:
        width = int(asset.get("width") or 0)
        height = int(asset.get("height") or 0)
    except (TypeError, ValueError):
        width = 0
        height = 0
    if width > height > 0:
        return LANDSCAPE_PRESET
    return PORTRAIT_PRESET


def live_encoder() -> Callable[[dict[str, Any], ProgressFn | None], bytes] | None:
    flag = os.environ.get("AME_BRIDGE_ENABLED", "1").strip().lower()
    if flag in {"0", "false", "no", "off"}:
        return None
    if not bridge_is_ready():
        logger.info("studio-compress AME bridge is not ready; using FFmpeg")
        return None
    root = Path(os.environ.get("AME_BRIDGE_ROOT") or DEFAULT_ROOT)

    def encode(asset: dict[str, Any], on_progress: ProgressFn | None = None) -> bytes:
        return encode_downloaded_master(
            root=root,
            asset=asset,
            fetch=fetch_master,
            on_progress=on_progress,
        )

    return encode


def fetch_master(r2_key: str, dest: Path) -> None:
    from item4.settings import pipeline_settings
    from item4.sources import download_via_media_bridge

    content, _mime = download_via_media_bridge(r2_key, pipeline_settings())
    if not content:
        raise RuntimeError("Studio master download was empty")
    dest.write_bytes(content)


def encode_downloaded_master(
    *,
    root: Path,
    asset: dict[str, Any],
    fetch: FetchFn,
    on_progress: ProgressFn | None = None,
    sleep: SleepFn = time.sleep,
    monotonic: ClockFn = time.monotonic,
    now: ClockFn = time.time,
    pickup_seconds: float = PICKUP_SECONDS,
    timeout_seconds: float = 20 * 60,
    poll_seconds: float = POLL_SECONDS,
    min_output_bytes: int = MIN_OUTPUT_BYTES,
) -> bytes:
    if not _marker_ok(root):
        raise AmeNotReady(f"AME bridge root is not marked at {root}")
    r2_key = str(asset.get("r2_key") or "").strip()
    if not r2_key:
        raise RuntimeError("Studio compression needs a private studio/master-assets key")
    preset = preset_for_asset(asset)
    inbox = root / "inbox" / preset
    inbox.mkdir(parents=True, exist_ok=True)
    source = inbox / _source_filename(asset, now())
    partial = source.with_name(source.name + ".partial")
    _progress(on_progress, 8)
    try:
        fetch(r2_key, partial)
        os_replace(partial, source)
    finally:
        if partial.exists():
            partial.unlink(missing_ok=True)
    if not source.is_file() or source.stat().st_size <= 0:
        raise RuntimeError("Studio master was not written to the Media Encoder inbox")
    logger.info(
        "studio-compress handed %s to Media Encoder inbox %s",
        source.name,
        preset,
    )
    _progress(on_progress, 15)

    started = monotonic()
    seen_output = False
    source_gone_at: float | None = None
    while True:
        clock = monotonic()
        output = _find_output(root, preset, source.stem, min_output_bytes)
        source_exists = source.is_file()
        if output is not None and not source_exists:
            content = output.read_bytes()
            if len(content) < min_output_bytes:
                raise RuntimeError("Media Encoder output was empty")
            _remove_parked_copies(root, preset, source.name)
            output.unlink(missing_ok=True)
            _progress(on_progress, 100)
            return content
        if _growing_output(root, preset, source.stem) is not None:
            seen_output = True
        if not source_exists:
            if source_gone_at is None:
                source_gone_at = clock
            elif not seen_output and clock - source_gone_at >= SOURCE_GONE_GRACE_SECONDS:
                raise AmeNotReady("inbox copy is gone and Media Encoder left no output")
        if not seen_output and source_exists and clock - started >= pickup_seconds:
            _unlink_inside(root, source)
            raise AmeNotReady("Media Encoder did not pick up the inbox file")
        if clock - started >= timeout_seconds:
            if seen_output or source_exists and _growing_output(root, preset, source.stem) is not None:
                raise RuntimeError(
                    "Adobe Media Encoder did not finish before the Studio compression limit"
                )
            if source_exists:
                _unlink_inside(root, source)
            raise AmeNotReady("Media Encoder did not pick up the inbox file")
        _progress(on_progress, 70 if seen_output else 25)
        sleep(poll_seconds)


def os_replace(src: Path, dest: Path) -> None:
    os.replace(src, dest)


def _progress(on_progress: ProgressFn | None, value: int) -> None:
    if on_progress is None:
        return
    on_progress(value)


def _marker_ok(root: Path) -> bool:
    path = root / MARKER_NAME
    if not path.is_file():
        return False
    try:
        body = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return False
    return isinstance(body, dict) and body.get("role") == MARKER_ROLE


def _source_filename(asset: dict[str, Any], stamp: float) -> str:
    suffix = Path(str(asset.get("name") or "video.mp4")).suffix.lower()
    if suffix not in SOURCE_EXTENSIONS:
        suffix = ".mp4"
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", str(asset.get("id") or "video"))[:48] or "video"
    return f"{safe_id}-{int(stamp)}{suffix}"


def _stem_matches(candidate: str, stem: str) -> bool:
    if candidate == stem:
        return True
    match = _DUPLICATE_SUFFIX.match(candidate)
    return bool(match and match.group("base") == stem)


def _candidate_outputs(root: Path, preset: str, stem: str) -> list[Path]:
    folders = (root / "out" / preset, root / "inbox" / preset / "Output")
    matches: list[Path] = []
    for folder in folders:
        if not folder.is_dir():
            continue
        for path in folder.iterdir():
            if not path.is_file() or path.is_symlink():
                continue
            if path.suffix.lower() not in OUTPUT_EXTENSIONS:
                continue
            if path.name.startswith("."):
                continue
            if not _stem_matches(path.stem, stem):
                continue
            matches.append(path)
    return matches


def _growing_output(root: Path, preset: str, stem: str) -> Path | None:
    matches = [path for path in _candidate_outputs(root, preset, stem) if path.stat().st_size > 0]
    if not matches:
        return None
    return max(matches, key=lambda path: path.stat().st_mtime)


def _find_output(root: Path, preset: str, stem: str, min_output_bytes: int) -> Path | None:
    matches = [
        path for path in _candidate_outputs(root, preset, stem) if path.stat().st_size >= min_output_bytes
    ]
    if not matches:
        return None
    return max(matches, key=lambda path: path.stat().st_mtime)


def _remove_parked_copies(root: Path, preset: str, filename: str) -> None:
    """Delete the copy Media Encoder moved under inbox/<preset>/Source."""
    parked_root = (root / "inbox" / preset / "Source").resolve()
    if not parked_root.is_dir() or not filename or filename in {".", ".."}:
        return
    matches = [path for path in parked_root.rglob(filename) if path.is_file() and not path.is_symlink()]
    for path in matches:
        resolved = path.resolve()
        if parked_root != resolved and parked_root not in resolved.parents:
            continue
        if resolved.name != filename:
            continue
        resolved.unlink()
        _prune_empty_parents(resolved.parent, parked_root)


def _prune_empty_parents(start: Path, stop: Path) -> None:
    current = start
    stop_resolved = stop.resolve()
    while True:
        try:
            resolved = current.resolve()
        except OSError:
            return
        if resolved == stop_resolved:
            return
        try:
            if any(current.iterdir()):
                return
            current.rmdir()
        except OSError:
            return
        current = current.parent


def _unlink_inside(root: Path, path: Path) -> None:
    if not path.exists():
        return
    resolved = path.resolve()
    inbox = (root / "inbox").resolve()
    if inbox != resolved and inbox not in resolved.parents:
        raise RuntimeError(f"refusing to delete outside the AME inbox: {path}")
    path.unlink()
