"""Health sweep and one-at-a-time smokes for the eight Windows local services."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pathlib import Path as _PathBootstrap
import sys as _sys

_HERE = _PathBootstrap(__file__).resolve().parent
if str(_HERE) not in _sys.path:
    _sys.path.insert(0, str(_HERE))

from catalog import load_catalog

USER_AGENT = "ChicagoShiningRegression/1.0"


class SmokeError(RuntimeError):
    pass


def _origin(public: bool, service: dict[str, Any]) -> str:
    key = "public" if public else "local"
    return str(service[key]).rstrip("/")


def _json(url: str, *, method: str = "GET", body: bytes | None = None, headers: dict[str, str] | None = None, timeout: int = 30) -> Any:
    req_headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if headers:
        req_headers.update(headers)
    request = Request(url, data=body, headers=req_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            status = getattr(response, "status", 200)
            content_type = str(response.headers.get("Content-Type") or "")
    except HTTPError as exc:
        raw = exc.read() if exc.fp else b""
        raise SmokeError(f"{url} HTTP {exc.code}: {raw[:500]!r}") from exc
    except URLError as exc:
        raise SmokeError(f"{url} unreachable: {exc.reason}") from exc
    if "json" in content_type.lower() or (raw[:1] in {b"{", b"["}):
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise SmokeError(f"{url} invalid JSON: {raw[:300]!r}") from exc
    return {"ok": True, "status": status, "bytes": len(raw), "content_type": content_type, "raw": raw}


def _get_bytes(url: str, *, headers: dict[str, str] | None = None, timeout: int = 60) -> tuple[bytes, str]:
    req_headers = {"User-Agent": USER_AGENT}
    if headers:
        req_headers.update(headers)
    request = Request(url, headers=req_headers, method="GET")
    with urlopen(request, timeout=timeout) as response:
        return response.read(), str(response.headers.get("Content-Type") or "")


def health_one(service: dict[str, Any], *, public: bool) -> dict[str, Any]:
    url = f"{_origin(public, service)}/health"
    payload = _json(url, timeout=20)
    if not isinstance(payload, dict) or payload.get("ok") is not True:
        raise SmokeError(f"{service['id']} health failed: {payload}")
    expected = service.get("health") or {}
    for key, value in expected.items():
        if key == "ok":
            continue
        if value is True and payload.get(key) is not True:
            raise SmokeError(f"{service['id']} health missing {key}=true: {payload}")
    if service["id"] == "pipeline-runner":
        registered = int(payload.get("stages_registered") or 0)
        implemented = int(payload.get("stages_implemented") or 0)
        if registered < 1 or implemented < 1 or implemented > registered:
            raise SmokeError(f"pipeline-runner stage counts look wrong: {payload}")
    return payload


def health_all(*, public: bool = False) -> dict[str, Any]:
    catalog = load_catalog()
    results = {}
    errors = []
    for key, service in (catalog.get("services") or {}).items():
        try:
            results[key] = health_one(service, public=public)
        except SmokeError as exc:
            errors.append(str(exc))
            results[key] = {"ok": False, "error": str(exc)}
    if errors:
        raise SmokeError("health sweep failed:\n" + "\n".join(errors))
    return {"ok": True, "public": public, "services": results}


def _ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise SmokeError("ffmpeg is not on PATH")
    return path


def _click_wav(path: Path, seconds: float = 4.0, bpm: float = 120.0) -> None:
    sr = 22050
    total = int(sr * seconds)
    frames = bytearray()
    interval = int(sr * (60.0 / bpm))
    for index in range(total):
        sample = 24000 if interval and index % interval < 200 else 0
        frames += int(sample).to_bytes(2, "little", signed=True)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(bytes(frames))


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A003
        return


def _serve(directory: Path, port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    handler = type("Handler", (_QuietHandler,), {"directory": str(directory)})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, bound = server.server_address[:2]
    return server, f"http://{host}:{bound}"


def smoke_pipeline(base: str) -> dict[str, Any]:
    payload = _json(f"{base}/health")
    jobs = payload.get("jobs") or []
    names = {row.get("name") for row in jobs if isinstance(row, dict)}
    if "studio-produce" not in names or "studio-compress" not in names:
        raise SmokeError(f"pipeline-runner jobs missing produce/compress: {jobs}")
    return {"ok": True, "stages_implemented": payload.get("stages_implemented"), "jobs": sorted(names)}


def smoke_youtube(base: str) -> dict[str, Any]:
    health = _json(f"{base}/health")
    result = {"ok": True, "oauthConfigured": health.get("oauthConfigured")}
    secret = os.environ.get("YOUTUBE_UPLOADER_SECRET") or os.environ.get("SM_PIPELINE_KEY") or ""
    if secret:
        status = _json(
            f"{base}/youtube/oauth/status",
            headers={"x-sm-pipeline-key": secret},
        )
        result["oauth_status"] = {key: status.get(key) for key in ("ok", "configured", "oauthConfigured", "refresh_token_length") if key in status or True}
        result["oauth_status"] = status
    return result


def smoke_watermark(base: str, catalog: dict[str, Any]) -> dict[str, Any]:
    photos = catalog["photos"]
    body = json.dumps({
        "imageUrl": photos["navy-pier"]["url"],
        "watermarkUrl": photos["cloud-gate"]["url"],
        "position": "bottom-right",
        "scale": 0.12,
        "outputFormat": "png",
    }).encode("utf-8")
    payload = _json(
        f"{base}/watermark-image",
        method="POST",
        body=body,
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    if int(payload.get("bytes") or 0) < 1000:
        raise SmokeError(f"watermark output too small: {payload}")
    if "png" not in str(payload.get("content_type") or "").lower() and not (payload.get("raw") or b"").startswith(b"\x89PNG"):
        raise SmokeError(f"watermark did not return PNG: {payload.get('content_type')}")
    return {"ok": True, "bytes": payload.get("bytes")}


def smoke_voiceover(base: str) -> dict[str, Any]:
    ffmpeg = _ffmpeg()
    with tempfile.TemporaryDirectory(prefix="regression-vo-") as tmp:
        src = Path(tmp) / "tone.mp3"
        subprocess.run(
            [ffmpeg, "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-c:a", "libmp3lame", "-b:a", "128k", str(src)],
            check=True,
            capture_output=True,
        )
        payload = src.read_bytes()
        result = _json(
            f"{base}/normalize-audio",
            method="POST",
            body=payload,
            headers={
                "Content-Type": "audio/mpeg",
                "X-Filename": "tone.mp3",
                "X-Target-LUFS": "-16",
                "X-True-Peak-dBTP": "-1.5",
                "X-Target-LRA": "7",
                "X-Output-Bitrate-Kbps": "128",
            },
            timeout=120,
        )
    download = str(result.get("download_url") or "")
    if result.get("ok") is False or not download:
        raise SmokeError(f"voiceover normalize failed: {result}")
    audio, _ctype = _get_bytes(download if download.startswith("http") else f"{base}{download}")
    if len(audio) < 500:
        raise SmokeError("normalized audio too small")
    return {"ok": True, "download_url": download, "bytes": len(audio)}


def smoke_timing(base: str, *, public: bool) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="regression-timing-") as tmp:
        wav = Path(tmp) / "clicks.wav"
        _click_wav(wav)
        if public:
            result = _json(
                f"{base}/timeline",
                method="POST",
                body=json.dumps({
                    "music_url": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg",
                    "music_start_seconds": 0,
                    "music_duration_seconds": 4,
                    "clip_count": 4,
                    "fps": 30,
                    "cleanup": True,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                timeout=90,
            )
        else:
            result = _json(
                f"{base}/timeline",
                method="POST",
                body=json.dumps({
                    "music_path": str(wav),
                    "music_start_seconds": 0,
                    "music_duration_seconds": 4,
                    "clip_count": 4,
                    "fps": 30,
                    "cleanup": False,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                timeout=90,
            )
    clips = ((result.get("timeline") or {}).get("clips")) or []
    if result.get("bpm", 0) <= 0 or len(clips) != 4:
        raise SmokeError(f"timing timeline unexpected: {result}")
    return {"ok": True, "bpm": result.get("bpm"), "clips": len(clips)}


def smoke_frames(base: str, *, public: bool) -> dict[str, Any]:
    if public:
        download_url = "https://www.w3schools.com/html/mov_bbb.mp4"
        payload = _json(
            f"{base}/extract",
            method="POST",
            body=json.dumps({
                "download_url": download_url,
                "record_id": "regression-frames",
                "asset_name": "bbb.mp4",
                "frame_count": 3,
                "frame_selection_mode": "even",
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=180,
        )
    else:
        ffmpeg = _ffmpeg()
        with tempfile.TemporaryDirectory(prefix="regression-frames-") as tmp:
            src = Path(tmp) / "clip.mp4"
            subprocess.run(
                [ffmpeg, "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(src)],
                check=True,
                capture_output=True,
            )
            server, origin = _serve(Path(tmp))
            try:
                payload = _json(
                    f"{base}/extract",
                    method="POST",
                    body=json.dumps({
                        "download_url": f"{origin}/clip.mp4",
                        "record_id": "regression-frames",
                        "asset_name": "clip.mp4",
                        "frame_count": 3,
                        "frame_selection_mode": "even",
                    }).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    timeout=180,
                )
            finally:
                server.shutdown()
    frames = payload.get("unique_frames") or payload.get("frames") or []
    if payload.get("ok") is False or len(frames) < 1:
        raise SmokeError(f"frame extract failed: {payload}")
    return {"ok": True, "frames": len(frames), "mode": payload.get("mode")}


def smoke_compressor(base: str, spec: dict[str, Any], *, public: bool) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("VIDEO_COMPRESSOR_API_KEY") or ""
    if api_key:
        headers["X-Compression-Key"] = api_key
    if public:
        body = {
            "drive_file_id": spec.get("drive_file_id") or "1j-QltV1ETljTtuYkapQ_AZJU9_lPG5YW",
            "record_id": "regression-compressor",
            "asset_name": "Streeterville 1.mp4",
            "output_filename": "regression-compressed.mp4",
            "target_mb": spec.get("target_mb") or 95,
            "max_width": 1080,
            "max_height": 1920,
            "audio_kbps": 128,
        }
        submitted = _json(
            f"{base}/compress",
            method="POST",
            body=json.dumps(body).encode("utf-8"),
            headers=headers,
            timeout=60,
        )
    else:
        ffmpeg = _ffmpeg()
        with tempfile.TemporaryDirectory(prefix="regression-compress-") as tmp:
            src = Path(tmp) / "source.mp4"
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
                    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
                    "-t", "8",
                    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "4M",
                    "-c:a", "aac", "-b:a", "128k",
                    str(src),
                ],
                check=True,
                capture_output=True,
            )
            server, origin = _serve(Path(tmp))
            try:
                submitted = _json(
                    f"{base}/compress",
                    method="POST",
                    body=json.dumps({
                        "download_url": f"{origin}/source.mp4",
                        "record_id": "regression-compressor",
                        "asset_name": "source.mp4",
                        "target_mb": 10,
                    }).encode("utf-8"),
                    headers=headers,
                    timeout=60,
                )
                status_url = submitted.get("status_url") or f"{base}/status/{submitted.get('job_id')}"
                if status_url.startswith("/"):
                    status_url = f"{base}{status_url}"
                deadline = time.time() + 180
                status = submitted
                while time.time() < deadline:
                    status = _json(status_url, timeout=30)
                    if status.get("status") in {"complete", "failed"}:
                        break
                    time.sleep(2)
            finally:
                server.shutdown()
        if status.get("status") != "complete" or status.get("ok") is not True:
            raise SmokeError(f"local compress failed: {status}")
        return {"ok": True, "job_id": status.get("job_id"), "output_size_mb": status.get("output_size_mb")}
    job_id = submitted.get("job_id")
    status_url = submitted.get("status_url") or (f"{base}/status/{job_id}" if job_id else "")
    if status_url.startswith("/"):
        status_url = f"{base}{status_url}"
    deadline = time.time() + 1200
    status = submitted
    while time.time() < deadline:
        status = _json(status_url, timeout=30)
        if status.get("status") in {"complete", "failed"}:
            break
        time.sleep(10)
    if status.get("status") != "complete" or status.get("ok") is not True:
        raise SmokeError(f"compress failed: {status}")
    if public and float(status.get("output_size_mb") or 999) > float(spec.get("target_mb") or 95):
        raise SmokeError(f"compress missed target: {status}")
    return {"ok": True, "job_id": status.get("job_id"), "output_size_mb": status.get("output_size_mb"), "target_met": status.get("target_met")}


def smoke_remotion(base: str) -> dict[str, Any]:
    submitted = _json(
        f"{base}/render",
        method="POST",
        body=json.dumps({
            "compositionId": "TEST-REMOTION-V4",
            "durationInFrames": 30,
            "fps": 30,
            "titleText": "REGRESSION",
            "brandText": "CHICAGOSHINING",
            "clips": [{
                "id": "video1",
                "url": "Assets/video1_proxy.mp4",
                "src": "Assets/video1_proxy.mp4",
                "durationFrames": 30,
                "motionStyle": "static",
            }],
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        timeout=60,
    )
    if submitted.get("accepted") is False:
        raise SmokeError(f"remotion rejected: {submitted}")
    job_id = submitted.get("jobId")
    status_url = submitted.get("statusUrl") or f"{base}/status/{job_id}"
    deadline = time.time() + 600
    status = submitted
    while time.time() < deadline:
        status = _json(status_url, timeout=30)
        state = str(status.get("status") or "")
        if state in {"done", "completed", "complete", "failed"}:
            break
        if status.get("renderUrl") and state in {"ready", "finished"}:
            break
        time.sleep(5)
    state = str(status.get("status") or "")
    if state == "failed" or status.get("error"):
        raise SmokeError(f"remotion failed: {status}")
    if state not in {"done", "completed", "complete", "ready", "finished"} and not status.get("renderUrl"):
        raise SmokeError(f"remotion did not finish: {status}")
    return {"ok": True, "jobId": job_id, "status": state, "renderUrl": status.get("renderUrl")}


def run_smoke(live_id: str, spec: dict[str, Any], *, public: bool) -> dict[str, Any]:
    catalog = load_catalog()
    service_key = spec["service"]
    service = (catalog.get("services") or {}).get(service_key)
    if not service:
        raise SmokeError(f"unknown service {service_key}")
    base = _origin(public, service)
    health = health_one(service, public=public)
    if live_id == "svc-pipeline":
        detail = smoke_pipeline(base)
    elif live_id == "svc-youtube":
        detail = smoke_youtube(base)
    elif live_id == "svc-watermark":
        detail = smoke_watermark(base, catalog)
    elif live_id == "svc-voiceover":
        detail = smoke_voiceover(base)
    elif live_id == "svc-timing":
        detail = smoke_timing(base, public=public)
    elif live_id == "svc-frames":
        detail = smoke_frames(base, public=public)
    elif live_id == "svc-compressor":
        detail = smoke_compressor(base, spec, public=public)
    elif live_id == "svc-remotion":
        detail = smoke_remotion(base)
    else:
        raise SmokeError(f"no smoke implemented for {live_id}")
    return {"ok": True, "id": live_id, "health": health, "smoke": detail, "public": public}
