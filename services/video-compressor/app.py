import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request, send_from_directory

APP_PORT = int(os.environ.get("PORT", "3335"))
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
API_KEY = os.environ.get("VIDEO_COMPRESSOR_API_KEY", "")
WORK_DIR = Path(os.environ.get("WORK_DIR", "work")).resolve()
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", "public/compressed")).resolve()
DEFAULT_TARGET_MB = float(os.environ.get("DEFAULT_TARGET_MB", "95"))
DEFAULT_MAX_WIDTH = int(os.environ.get("DEFAULT_MAX_WIDTH", "1080"))
DEFAULT_MAX_HEIGHT = int(os.environ.get("DEFAULT_MAX_HEIGHT", "1920"))
DEFAULT_AUDIO_KBPS = int(os.environ.get("DEFAULT_AUDIO_KBPS", "128"))
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("MAX_CONCURRENT_JOBS", "1")))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("DOWNLOAD_TIMEOUT_SECONDS", "900"))

WORK_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
jobs = {}
jobs_lock = threading.Lock()
worker_slots = threading.Semaphore(MAX_CONCURRENT_JOBS)


def require_api_key():
    if not API_KEY:
        return None
    supplied = request.headers.get("X-Compression-Key", "")
    if supplied != API_KEY:
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return None


def run_cmd(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}\n{stderr[-4000:]}")
    return (result.stdout or "").strip()


def clamp(value, default, minimum, maximum, cast=float):
    try:
        value = cast(value)
    except Exception:
        value = cast(default)
    return max(cast(minimum), min(cast(maximum), value))


def safe_filename(name):
    raw = Path(str(name or "video.mp4")).stem
    cleaned = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in raw).strip("._")
    return (cleaned or "video")[:120] + ".mp4"


def validate_download_url(url):
    try:
        parsed = urlparse(url)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def download_file(url, dest):
    with requests.get(url, stream=True, timeout=(30, DOWNLOAD_TIMEOUT_SECONDS), allow_redirects=True) as response:
        response.raise_for_status()
        with open(dest, "wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def ffprobe_json(path):
    import json
    output = run_cmd([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration,size:stream=codec_type,width,height",
        "-of", "json", str(path)
    ])
    return json.loads(output)


def probe_media(path):
    data = ffprobe_json(path)
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    duration = max(float(fmt.get("duration") or 0), 0.1)
    size_bytes = int(fmt.get("size") or path.stat().st_size)
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    return {
        "duration_seconds": duration,
        "size_bytes": size_bytes,
        "has_audio": has_audio,
        "width": int(video.get("width") or 0),
        "height": int(video.get("height") or 0),
    }


def set_job(job_id, **updates):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return
        job.update(updates)
        job["updated_at"] = int(time.time())


def get_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        return dict(job) if job else None


def scale_filter(max_width, max_height):
    return f"scale={max_width}:{max_height}:force_original_aspect_ratio=decrease:force_divisible_by=2"


def calculate_bitrate_budget(duration_seconds, target_bytes, requested_audio_kbps, has_audio, safety_factor=0.94):
    total_kbps = (target_bytes * 8.0 / max(duration_seconds, 0.1) / 1000.0) * safety_factor
    total_kbps = max(64, total_kbps)

    if has_audio:
        # Keep audio within the total target for unusually long source videos.
        audio_kbps = min(int(requested_audio_kbps), max(32, int(total_kbps * 0.18)))
    else:
        audio_kbps = 0

    video_kbps = int(total_kbps - audio_kbps)
    video_kbps = max(32, min(video_kbps, 20000))
    return video_kbps, audio_kbps


def two_pass_encode(input_path, output_path, passlog_path, video_kbps, audio_kbps, has_audio, max_width, max_height):
    vf = scale_filter(max_width, max_height)
    common = [
        "ffmpeg", "-y", "-hide_banner", "-i", str(input_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium",
        "-b:v", f"{video_kbps}k",
        "-pix_fmt", "yuv420p",
        "-passlogfile", str(passlog_path),
    ]

    run_cmd(common + [
        "-pass", "1", "-an", "-f", "null", os.devnull
    ])

    second = common + ["-pass", "2"]
    if has_audio:
        second += ["-c:a", "aac", "-b:a", f"{audio_kbps}k"]
    else:
        second += ["-an"]
    second += ["-movflags", "+faststart", str(output_path)]
    run_cmd(second)


def cleanup_passlogs(passlog_path):
    prefix = passlog_path.name
    parent = passlog_path.parent
    for candidate in parent.glob(prefix + "*"):
        try:
            candidate.unlink()
        except Exception:
            pass


def process_job(job_id, payload):
    with worker_slots:
        download_url = payload["download_url"]
        target_mb = payload["target_mb"]
        max_width = payload["max_width"]
        max_height = payload["max_height"]
        requested_audio_kbps = payload["audio_kbps"]
        output_name = payload["output_name"]
        base_url = payload["base_url"]

        job_work = WORK_DIR / job_id
        job_output = OUTPUT_DIR / job_id
        job_work.mkdir(parents=True, exist_ok=True)
        job_output.mkdir(parents=True, exist_ok=True)
        input_path = job_work / "source"
        output_path = job_output / output_name
        passlog_path = job_work / "ffmpeg2pass"

        try:
            set_job(job_id, status="downloading", progress=5)
            download_file(download_url, input_path)
            source = probe_media(input_path)
            source_mb = round(source["size_bytes"] / 1024 / 1024, 2)
            set_job(
                job_id,
                status="compressing",
                progress=20,
                source_size_mb=source_mb,
                duration_seconds=round(source["duration_seconds"], 2),
                source_width=source["width"],
                source_height=source["height"],
            )

            target_bytes = int(target_mb * 1024 * 1024)
            video_kbps, audio_kbps = calculate_bitrate_budget(
                source["duration_seconds"], target_bytes, requested_audio_kbps, source["has_audio"], 0.94
            )

            two_pass_encode(
                input_path, output_path, passlog_path,
                video_kbps, audio_kbps, source["has_audio"], max_width, max_height
            )
            cleanup_passlogs(passlog_path)

            output_size = output_path.stat().st_size
            if output_size > target_bytes:
                # A second bounded attempt corrects unusual container/audio overhead.
                set_job(job_id, status="compressing", progress=70, retry_for_target=True)
                ratio = target_bytes / output_size
                corrected_video_kbps = max(32, int(video_kbps * ratio * 0.90))
                corrected_audio_kbps = max(24, int(audio_kbps * ratio * 0.95)) if source["has_audio"] else 0
                two_pass_encode(
                    input_path, output_path, passlog_path,
                    corrected_video_kbps, corrected_audio_kbps,
                    source["has_audio"], max_width, max_height
                )
                cleanup_passlogs(passlog_path)
                video_kbps = corrected_video_kbps
                audio_kbps = corrected_audio_kbps
                output_size = output_path.stat().st_size

            final = probe_media(output_path)
            output_mb = round(output_size / 1024 / 1024, 2)
            compression_ratio = round(output_size / source["size_bytes"], 4) if source["size_bytes"] else None
            file_url = f"{base_url}/files/{job_id}/{output_name}"

            set_job(
                job_id,
                status="complete",
                progress=100,
                ok=True,
                output_url=file_url,
                output_filename=output_name,
                output_size_bytes=output_size,
                output_size_mb=output_mb,
                target_mb=target_mb,
                target_met=output_size <= target_bytes,
                video_bitrate_kbps=video_kbps,
                audio_bitrate_kbps=audio_kbps if source["has_audio"] else 0,
                output_width=final["width"],
                output_height=final["height"],
                compression_ratio=compression_ratio,
            )
        except Exception as exc:
            set_job(job_id, status="failed", progress=100, ok=False, error=str(exc))
        finally:
            cleanup_passlogs(passlog_path)
            try:
                if input_path.exists():
                    input_path.unlink()
                if job_work.exists():
                    job_work.rmdir()
            except Exception:
                pass


@app.before_request
def auth_guard():
    if request.path in {"/", "/health"} or request.path.startswith("/files/"):
        return None
    return require_api_key()


@app.get("/")
@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "service": "chicagoshining-local-video-compressor",
        "version": "1.0.1",
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "ffprobe": shutil.which("ffprobe") is not None,
        "port": APP_PORT,
        "default_target_mb": DEFAULT_TARGET_MB,
        "max_concurrent_jobs": MAX_CONCURRENT_JOBS,
        "api_key_required": bool(API_KEY),
        "async_jobs": True,
    })


@app.post("/compress")
def compress():
    payload = request.get_json(force=True, silent=True) or {}
    download_url = str(payload.get("download_url") or "").strip()
    if not validate_download_url(download_url):
        return jsonify({"ok": False, "error": "Missing or invalid download_url"}), 400

    target_mb = clamp(payload.get("target_mb"), DEFAULT_TARGET_MB, 10, 99, float)
    max_width = clamp(payload.get("max_width"), DEFAULT_MAX_WIDTH, 320, 3840, int)
    max_height = clamp(payload.get("max_height"), DEFAULT_MAX_HEIGHT, 320, 3840, int)
    audio_kbps = clamp(payload.get("audio_kbps"), DEFAULT_AUDIO_KBPS, 32, 320, int)
    record_id = str(payload.get("record_id") or "unknown")[:100]
    asset_name = str(payload.get("asset_name") or "video.mp4")[:255]
    output_name = safe_filename(payload.get("output_filename") or asset_name)
    base_url = PUBLIC_BASE_URL or request.url_root.rstrip("/")
    job_id = f"{record_id}_{uuid.uuid4().hex[:12]}"

    now = int(time.time())
    with jobs_lock:
        jobs[job_id] = {
            "ok": True,
            "job_id": job_id,
            "record_id": record_id,
            "asset_name": asset_name,
            "status": "queued",
            "progress": 0,
            "created_at": now,
            "updated_at": now,
            "target_mb": target_mb,
        }

    worker_payload = {
        "download_url": download_url,
        "target_mb": target_mb,
        "max_width": max_width,
        "max_height": max_height,
        "audio_kbps": audio_kbps,
        "output_name": output_name,
        "base_url": base_url,
    }
    threading.Thread(target=process_job, args=(job_id, worker_payload), daemon=True).start()

    return jsonify({
        "ok": True,
        "job_id": job_id,
        "status": "queued",
        "status_url": f"{base_url}/jobs/{job_id}",
        "target_mb": target_mb,
    }), 202


@app.get("/jobs/<job_id>")
def job_status(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "Job not found"}), 404
    return jsonify(job)


@app.delete("/jobs/<job_id>")
def delete_job(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({"ok": False, "error": "Job not found"}), 404
    if job.get("status") not in {"complete", "failed"}:
        return jsonify({"ok": False, "error": "Job is still active"}), 409

    output_path = OUTPUT_DIR / job_id
    try:
        if output_path.exists():
            shutil.rmtree(output_path)
    except Exception as exc:
        return jsonify({"ok": False, "error": f"Cleanup failed: {exc}"}), 500

    with jobs_lock:
        jobs.pop(job_id, None)
    return jsonify({"ok": True, "job_id": job_id, "deleted": True})


@app.get("/files/<job_id>/<path:filename>")
def files(job_id, filename):
    return send_from_directory(OUTPUT_DIR / job_id, filename, as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=APP_PORT, threaded=True)
