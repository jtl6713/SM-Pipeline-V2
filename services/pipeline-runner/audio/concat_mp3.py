"""Concatenate MP3 voiceover segments into one file."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from audio.leading_silence import _run, ffmpeg_bin


def concat_mp3_bytes(parts: list[bytes]) -> bytes:
    """Join ordered MP3 payloads with ffmpeg's concat filter.

    Re-encodes through libmp3lame so mismatched bitrates/headers from separate
    ElevenLabs calls still produce a continuous file Remotion can play from t=0.
    """
    payloads = [bytes(part or b"") for part in parts if part]
    if not payloads:
        raise RuntimeError("no audio segments to concatenate")
    if len(payloads) == 1:
        return payloads[0]
    if not shutil.which(ffmpeg_bin()) and not Path(ffmpeg_bin()).exists():
        raise RuntimeError("ffmpeg is not available for voiceover concatenation")

    with tempfile.TemporaryDirectory(prefix="vo-concat-") as tmp:
        root = Path(tmp)
        inputs: list[Path] = []
        for index, payload in enumerate(payloads):
            path = root / f"seg-{index:03d}.mp3"
            path.write_bytes(payload)
            inputs.append(path)
        output = root / "concat.mp3"
        cmd = [ffmpeg_bin(), "-hide_banner", "-nostats", "-y"]
        for path in inputs:
            cmd.extend(["-i", str(path)])
        filter_inputs = "".join(f"[{index}:a]" for index in range(len(inputs)))
        cmd.extend([
            "-filter_complex",
            f"{filter_inputs}concat=n={len(inputs)}:v=0:a=1[a]",
            "-map",
            "[a]",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output),
        ])
        result = _run(cmd)
        if result.returncode != 0 or not output.exists() or output.stat().st_size <= 0:
            detail = (result.stderr or result.stdout or "ffmpeg concat failed")[-2000:]
            raise RuntimeError(detail)
        return output.read_bytes()
