"""A short MP3 of silence for a still the writer left unspoken."""

from __future__ import annotations

import tempfile
from pathlib import Path

from audio.leading_silence import _run, ffmpeg_bin


def silence_mp3_bytes(seconds: float) -> bytes:
    duration = max(0.2, float(seconds or 0))
    with tempfile.TemporaryDirectory(prefix="vo-silence-") as tmp:
        output = Path(tmp) / "silence.mp3"
        cmd = [
            ffmpeg_bin(),
            "-hide_banner",
            "-nostats",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output),
        ]
        result = _run(cmd)
        if result.returncode != 0 or not output.exists() or output.stat().st_size <= 0:
            detail = (result.stderr or result.stdout or "ffmpeg silence failed")[-2000:]
            raise RuntimeError(detail)
        return output.read_bytes()
