import os
import uuid
import json
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urljoin

import requests
from flask import Flask, request, jsonify, send_from_directory

from image_metadata import extract_image_metadata

APP_PORT = int(os.environ.get("PORT", "3334"))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
WORK_DIR = Path(os.environ.get("WORK_DIR", "work")).resolve()
FRAME_DIR = Path(os.environ.get("FRAME_DIR", "public/frames")).resolve()

WORK_DIR.mkdir(parents=True, exist_ok=True)
FRAME_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)


def run_cmd(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\nSTDERR: {result.stderr}")
    return result.stdout.strip()


def ffprobe_duration_seconds(video_path: Path) -> float:
    output = run_cmd([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path)
    ])
    return max(float(output or 0), 0.1)


def download_file(url: str, dest: Path):
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)


def clamp_int(value, default, minimum, maximum):
    try:
        value = int(value)
    except Exception:
        value = default
    return max(minimum, min(maximum, value))


def clamp_float(value, default, minimum, maximum):
    try:
        value = float(value)
    except Exception:
        value = default
    return max(minimum, min(maximum, value))


def frame_url(filename: str) -> str:
    base = PUBLIC_BASE_URL or request.url_root.rstrip("/")
    return f"{base}/frames/{filename}"


def evenly_spaced_timestamps(duration: float, frame_count: int) -> list[float]:
    """Return timestamps spread across the video, avoiding the first/last frame."""
    return [duration * (i + 1) / (frame_count + 1) for i in range(frame_count)]


def scene_change_timestamps(video_path: Path, threshold: float = 0.25) -> list[float]:
    """
    Use FFmpeg scene detection to find visual-change timestamps.
    Lower threshold = more sensitive. Typical useful range: 0.18 to 0.35.
    """
    cmd = [
        "ffmpeg", "-hide_banner", "-i", str(video_path),
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-an", "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    text = (result.stderr or "") + "\n" + (result.stdout or "")

    timestamps = []
    for line in text.splitlines():
        # showinfo lines contain pts_time:<seconds>
        marker = "pts_time:"
        if marker in line:
            try:
                value = line.split(marker, 1)[1].split()[0]
                ts = float(value)
                if ts > 0:
                    timestamps.append(ts)
            except Exception:
                pass

    # De-dupe close timestamps caused by noisy edits or flashes.
    cleaned = []
    for ts in sorted(timestamps):
        if not cleaned or abs(ts - cleaned[-1]) >= 0.75:
            cleaned.append(ts)
    return cleaned


def choose_scene_timestamps(video_path: Path, duration: float, frame_count: int, threshold: float) -> list[float]:
    """Pick scene-change timestamps, spread across the video if too many are found."""
    scenes = [ts for ts in scene_change_timestamps(video_path, threshold) if 0.1 < ts < duration - 0.1]
    if len(scenes) <= frame_count:
        return scenes

    # If many scene changes are found, sample them evenly from the scene list.
    picked = []
    for i in range(frame_count):
        idx = round(i * (len(scenes) - 1) / max(frame_count - 1, 1))
        picked.append(scenes[idx])
    return sorted(set(picked))[:frame_count]


def choose_hybrid_timestamps(video_path: Path, duration: float, frame_count: int, threshold: float) -> list[float]:
    """
    Prefer scene-change frames; if too few are found, fill the remainder with
    evenly spaced timestamps. This is the recommended mode for A3.
    """
    selected = choose_scene_timestamps(video_path, duration, frame_count, threshold)
    even = evenly_spaced_timestamps(duration, frame_count)

    # Fill missing slots with evenly spaced timestamps that are not too close to selected frames.
    for ts in even:
        if len(selected) >= frame_count:
            break
        if all(abs(ts - existing) >= 0.75 for existing in selected):
            selected.append(ts)

    # If a very short/odd clip still has too few, allow closer even timestamps.
    for ts in even:
        if len(selected) >= frame_count:
            break
        if ts not in selected:
            selected.append(ts)

    return sorted(selected)[:frame_count]


def select_timestamps(video_path: Path, duration: float, frame_count: int, mode: str, threshold: float) -> tuple[list[float], str]:
    mode = (mode or "even").lower().strip()
    if mode not in {"even", "scene", "hybrid"}:
        mode = "even"

    if mode == "scene":
        timestamps = choose_scene_timestamps(video_path, duration, frame_count, threshold)
    elif mode == "hybrid":
        timestamps = choose_hybrid_timestamps(video_path, duration, frame_count, threshold)
    else:
        timestamps = evenly_spaced_timestamps(duration, frame_count)

    # Scene mode can return too few frames. If it returns none, fall back to even so A3 still works.
    if not timestamps:
        timestamps = evenly_spaced_timestamps(duration, frame_count)
        mode = "even_fallback"

    return timestamps[:frame_count], mode


@app.get("/")
@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "service": "chicagoshining-local-frame-extractor",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "ffprobe": shutil.which("ffprobe") is not None,
        "supports_frame_selection_mode": True,
        "frame_selection_modes": ["even", "scene", "hybrid"],
        "supports_image_metadata": True,
    })


@app.post("/extract")
def extract():
    payload = request.get_json(force=True, silent=True) or {}

    download_url = payload.get("download_url")
    record_id = payload.get("record_id", "unknown")
    asset_name = payload.get("asset_name", "")

    if not download_url:
        return jsonify({
            "ok": False,
            "error": "Missing download_url",
            "frames_analyzed_count": 0,
            "unique_frames": [],
            "frames": []
        }), 400

    frame_count = clamp_int(payload.get("frame_count"), 5, 1, 8)
    slot_count = clamp_int(payload.get("slot_count"), max(frame_count, 8), 1, 8)
    frame_quality = clamp_int(payload.get("frame_quality"), 72, 40, 95)
    max_width = clamp_int(payload.get("max_width"), 1280, 320, 1920)
    frame_selection_mode = str(payload.get("frame_selection_mode", "even")).lower().strip()
    scene_threshold = clamp_float(payload.get("scene_threshold"), 0.25, 0.05, 0.80)

    if frame_selection_mode not in {"even", "scene", "hybrid"}:
        frame_selection_mode = "even"

    job_id = f"{record_id}_{uuid.uuid4().hex[:8]}"
    video_path = WORK_DIR / f"{job_id}.mp4"
    job_frame_dir = FRAME_DIR / job_id
    job_frame_dir.mkdir(parents=True, exist_ok=True)

    try:
        download_file(download_url, video_path)
        duration = ffprobe_duration_seconds(video_path)

        timestamps, actual_selection_mode = select_timestamps(
            video_path=video_path,
            duration=duration,
            frame_count=frame_count,
            mode=frame_selection_mode,
            threshold=scene_threshold
        )

        unique_frames = []
        extracted_timestamps = []
        for idx, ts in enumerate(timestamps, start=1):
            filename = f"{job_id}/frame_{idx:02d}.jpg"
            out_path = FRAME_DIR / filename
            run_cmd([
                "ffmpeg", "-y",
                "-ss", f"{ts:.3f}",
                "-i", str(video_path),
                "-frames:v", "1",
                "-vf", f"scale='min({max_width},iw)':-2",
                "-q:v", str(max(2, min(31, round((100 - frame_quality) / 3.2)))),
                str(out_path)
            ])
            unique_frames.append(frame_url(filename))
            extracted_timestamps.append(round(ts, 3))

        # Make/OpenAI image inputs are static in the blueprint.
        # Pad slots with the last real frame so lower frame_count settings still work.
        frames = list(unique_frames)
        while frames and len(frames) < slot_count:
            frames.append(frames[-1])

        return jsonify({
            "ok": True,
            "record_id": record_id,
            "asset_name": asset_name,
            "duration_seconds": round(duration, 2),
            "frames_analyzed_count": len(unique_frames),
            "unique_frames": unique_frames,
            "frames": frames[:slot_count],
            "requested_frame_count": frame_count,
            "slot_count": slot_count,
            "frame_quality": frame_quality,
            "max_width": max_width,
            "frame_selection_mode_requested": frame_selection_mode,
            "frame_selection_mode_used": actual_selection_mode,
            "scene_threshold": scene_threshold,
            "frame_timestamps_seconds": extracted_timestamps
        })

    except Exception as e:
        return jsonify({
            "ok": False,
            "error": str(e),
            "frames_analyzed_count": 0,
            "unique_frames": [],
            "frames": []
        }), 200

    finally:
        try:
            if video_path.exists():
                video_path.unlink()
        except Exception:
            pass


@app.post("/image-metadata")
def image_metadata_route():
    payload = request.get_json(force=True, silent=True) or {}
    download_url = payload.get("download_url")
    asset_name = str(payload.get("asset_name") or "").strip()
    record_id = payload.get("record_id", "unknown")

    if not download_url:
        meta = extract_image_metadata(b"", asset_name=asset_name)
        meta["ok"] = False
        meta["error"] = "Missing download_url"
        meta["record_id"] = record_id
        return jsonify(meta), 400

    suffix = ".jpg"
    if asset_name and "." in asset_name:
        suffix = Path(asset_name).suffix or suffix
    job_id = f"{record_id}_{uuid.uuid4().hex[:8]}"
    image_path = WORK_DIR / f"{job_id}{suffix}"

    try:
        download_file(download_url, image_path)
        content = image_path.read_bytes()
        meta = extract_image_metadata(content, asset_name=asset_name)
        meta["record_id"] = record_id
        meta["asset_name"] = asset_name
        meta["mime_type"] = payload.get("mime_type")
        meta["file_size_mb"] = payload.get("file_size_mb")
        return jsonify(meta)
    except Exception as exc:
        meta = extract_image_metadata(b"", asset_name=asset_name)
        meta["ok"] = False
        meta["error"] = str(exc)
        meta["record_id"] = record_id
        return jsonify(meta), 200
    finally:
        try:
            if image_path.exists():
                image_path.unlink()
        except Exception:
            pass


@app.get("/frames/<path:filename>")
def frames(filename):
    return send_from_directory(FRAME_DIR, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT)
