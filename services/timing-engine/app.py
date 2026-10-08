from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from timing_engine.beats import analyze_beats
from timing_engine.rules import DEFAULT_RULES
from timing_engine.sources import TimingContext
from timing_engine.timeline import build_timeline, merge_sources

APP_PORT = int(os.environ.get("PORT", "3336"))
HOST = os.environ.get("HOST", "127.0.0.1")
WORK_DIR = Path(os.environ.get("WORK_DIR", "work")).resolve()
WORK_DIR.mkdir(parents=True, exist_ok=True)
VERSION = "2026-10-07-voiceover-duration-guard"

app = FastAPI(title="SM Pipeline V2 Timing Engine", version=VERSION)


class TimelineRequest(BaseModel):
    schema_version: str = "timing.request.1"
    music_url: str | None = None
    music_path: str | None = None
    music_start_seconds: float = 0
    music_duration_seconds: float = 30
    clip_count: int = Field(..., ge=1)
    fps: int = 30
    transition_rules: dict[str, Any] | None = None
    sources: list[str] = Field(default_factory=lambda: ["beats"])
    default_transition: dict[str, Any] | None = None
    voiceover_end_seconds: float | None = None
    cleanup: bool = True


def _download(url: str, dest: Path) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="music_url must be http(s)")
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with dest.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def _resolve_audio(body: TimelineRequest) -> tuple[Path, bool]:
    if body.music_path:
        path = Path(body.music_path)
        if not path.is_file():
            raise HTTPException(status_code=400, detail="music_path does not exist")
        return path, False
    if not body.music_url:
        raise HTTPException(status_code=400, detail="music_url or music_path is required")
    dest = WORK_DIR / f"timing-{uuid.uuid4().hex}.audio"
    try:
        _download(body.music_url, dest)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download music: {exc}") from exc
    return dest, True


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "SM Pipeline V2 Timing Engine",
        "version": VERSION,
        "port": APP_PORT,
        "host": HOST,
    }


@app.post("/timeline")
def create_timeline(body: TimelineRequest) -> dict[str, Any]:
    audio_path, downloaded = _resolve_audio(body)
    owned = downloaded or body.cleanup
    try:
        analysis = analyze_beats(
            str(audio_path),
            music_start_seconds=body.music_start_seconds,
            music_duration_seconds=body.music_duration_seconds,
        )
        ctx = TimingContext(
            audio_path=str(audio_path),
            music_start_seconds=body.music_start_seconds,
            music_duration_seconds=body.music_duration_seconds,
            extra={"voiceover_end_seconds": body.voiceover_end_seconds},
        )
        events, source_meta = merge_sources(ctx, body.sources)
        timeline = build_timeline(
            beats_in_window=analysis["beats_in_window"],
            clip_count=body.clip_count,
            duration_seconds=body.music_duration_seconds,
            fps=body.fps,
            rules=body.transition_rules or DEFAULT_RULES,
            transition=body.default_transition,
            extra_events=events,
            voiceover_end_seconds=body.voiceover_end_seconds,
            beat_strengths=analysis.get("beat_strengths"),
        )
        metadata = dict(timeline.get("metadata") or {})
        metadata.update(source_meta)
        metadata.update(analysis["metadata"])
        timeline["metadata"] = metadata
        return {
            "schema_version": "timing.response.1",
            "bpm": analysis["bpm"],
            "beats": analysis["beats"],
            "beats_in_window": analysis["beats_in_window"],
            "beat_strengths": analysis.get("beat_strengths") or [],
            "window": analysis["window"],
            "timeline": timeline,
            "transitions": timeline["transitions"],
            "metadata": timeline["metadata"],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if owned and downloaded and audio_path.exists():
            audio_path.unlink(missing_ok=True)


def main() -> None:
    import uvicorn
    from scratch_ttl import env_hours, env_int, start_hourly_sweep, sweep_root

    start_hourly_sweep(
        lambda: sweep_root(
            WORK_DIR,
            ttl_hours=env_hours("TIMING_ENGINE_TTL_HOURS", 24),
            max_jobs=env_int("TIMING_ENGINE_SWEEP_MAX_JOBS", 50),
            files_as_jobs=True,
        ),
        interval_seconds=env_int("TIMING_ENGINE_SWEEP_INTERVAL_SECONDS", 3600),
    )
    uvicorn.run("app:app", host=HOST, port=APP_PORT, reload=False)


if __name__ == "__main__":
    main()
