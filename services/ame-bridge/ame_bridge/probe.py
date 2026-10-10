"""Validate a finished encode before the watch-folder source copy is removed."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


def ffprobe_video(path: Path) -> dict:
    exe = shutil.which("ffprobe")
    if not exe:
        return {"ok": False, "error": "ffprobe_missing"}
    try:
        completed = subprocess.run(
            [
                exe,
                "-v",
                "error",
                "-show_entries",
                "format=duration:stream=codec_type,width,height",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {"ok": False, "error": "probe_failed"}
    if completed.returncode != 0:
        return {"ok": False, "error": "probe_failed"}
    try:
        payload = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        return {"ok": False, "error": "probe_failed"}
    streams = payload.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not isinstance(video, dict):
        return {"ok": False, "error": "no_video_stream"}
    try:
        duration = float((payload.get("format") or {}).get("duration") or 0)
        width = int(video.get("width") or 0)
        height = int(video.get("height") or 0)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid_media"}
    if duration <= 0 or width <= 0 or height <= 0:
        return {"ok": False, "error": "invalid_media"}
    return {"ok": True, "width": width, "height": height, "duration": duration}
