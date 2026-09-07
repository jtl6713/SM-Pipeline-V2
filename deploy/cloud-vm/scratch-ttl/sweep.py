"""Independent TTL safety sweep for the shared cloud-vm scratch volume.

Drive remains the DAM. This process only deletes working copies under /scratch.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from scratch_ttl import env_hours, env_int, sweep_root

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scratch-ttl-sidecar")

ROOT = Path(os.environ.get("SCRATCH_ROOT", "/scratch")).resolve()
INTERVAL = env_int("SCRATCH_TTL_INTERVAL_SECONDS", 3600)
MAX_JOBS = env_int("SCRATCH_TTL_MAX_JOBS", 50)

TARGETS = (
    (ROOT / "frame-extractor" / "frames", env_hours("FRAME_EXTRACTOR_TTL_HOURS", 24), False),
    (ROOT / "frame-extractor" / "work", env_hours("FRAME_EXTRACTOR_TTL_HOURS", 24), True),
    (ROOT / "video-compressor" / "compressed", env_hours("VIDEO_COMPRESSOR_TTL_HOURS", 24), False),
    (ROOT / "video-compressor" / "work", env_hours("VIDEO_COMPRESSOR_TTL_HOURS", 24), True),
    (ROOT / "timing-engine" / "work", env_hours("TIMING_ENGINE_TTL_HOURS", 24), True),
    (ROOT / "remotion" / "out", env_hours("REMOTION_STALE_CLEANUP_HOURS", 72), True),
    (ROOT / "remotion" / "render-props", env_hours("REMOTION_STALE_CLEANUP_HOURS", 72), True),
    (ROOT / "remotion" / "render-assets", env_hours("REMOTION_STALE_CLEANUP_HOURS", 72), False),
    (ROOT / "youtube" / "tmp", env_hours("YOUTUBE_JOB_RETENTION_HOURS", 24), True),
)


def run_once() -> None:
    for path, ttl_hours, files_as_jobs in TARGETS:
        path.mkdir(parents=True, exist_ok=True)
        result = sweep_root(
            path,
            ttl_hours=ttl_hours,
            max_jobs=MAX_JOBS,
            files_as_jobs=files_as_jobs,
        )
        log.info(
            "sweep root=%s ttl_hours=%s ok=%s files=%s bytes=%s selected=%s",
            path,
            ttl_hours,
            result.get("ok"),
            result.get("files"),
            result.get("bytes"),
            len(result.get("selected") or []),
        )


def main() -> None:
    log.info("scratch ttl sidecar root=%s interval=%ss", ROOT, INTERVAL)
    while True:
        try:
            run_once()
        except Exception:
            log.exception("scratch ttl sidecar sweep failed")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
