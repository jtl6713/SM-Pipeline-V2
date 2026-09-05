from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Any

from t1.slice import is_video_clip, source_key


def scene_change_timestamps(video_path: Path, threshold: float = 0.25) -> list[float]:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(video_path),
        "-vf",
        f"select='gt(scene,{threshold})',showinfo",
        "-an",
        "-f",
        "null",
        "-",
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    text = f"{result.stderr or ''}\n{result.stdout or ''}"
    timestamps: list[float] = []
    marker = "pts_time:"
    for line in text.splitlines():
        if marker not in line:
            continue
        try:
            value = line.split(marker, 1)[1].split()[0]
            stamp = float(value)
        except (TypeError, ValueError, IndexError):
            continue
        if stamp > 0:
            timestamps.append(stamp)
    cleaned: list[float] = []
    for stamp in sorted(timestamps):
        if not cleaned or abs(stamp - cleaned[-1]) >= 0.75:
            cleaned.append(round(stamp, 4))
    return cleaned


def cached_scene_seconds(clip: dict[str, Any]) -> list[float] | None:
    raw = clip.get("scene_seconds") or clip.get("sceneSeconds")
    if not isinstance(raw, list):
        return None
    values = [float(item) for item in raw if isinstance(item, (int, float))]
    return values


def _drive_id(clip: dict[str, Any]) -> str:
    return str(clip.get("googleDriveFileId") or clip.get("google_drive_file_id") or "").strip()


def scene_times_for_clips(
    clips: list[dict[str, Any]],
    *,
    drive: Any | None = None,
    probe=None,
) -> dict[str, list[float]]:
    times: dict[str, list[float]] = {}
    for clip in clips:
        if not is_video_clip(clip):
            continue
        key = source_key(clip)
        if not key or key in times:
            continue
        cached = cached_scene_seconds(clip)
        if cached is not None:
            times[key] = cached
            continue
        file_id = _drive_id(clip)
        if not file_id or drive is None:
            times[key] = []
            continue
        try:
            content, _mime = drive.download_file(file_id, timeout=60)
            suffix = Path(str(clip.get("assetName") or clip.get("asset_name") or "clip.mp4")).suffix or ".mp4"
            handle = tempfile.NamedTemporaryFile(prefix="t1-scene-", suffix=suffix, delete=False)
            handle.write(content)
            handle.close()
            path = Path(handle.name)
            try:
                times[key] = (probe or scene_change_timestamps)(path)
            finally:
                path.unlink(missing_ok=True)
        except Exception:
            times[key] = []
        clip["scene_seconds"] = times[key]
        clip["sceneSeconds"] = times[key]
    return times
