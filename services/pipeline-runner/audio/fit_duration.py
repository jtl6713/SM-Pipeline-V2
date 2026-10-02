"""Force an MP3 to an exact duration for Timed Script scene windows."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from audio.leading_silence import _run, ffmpeg_bin
from audio.voiceover_duration import probe_audio_duration_bytes

DURATION_TOLERANCE_SECONDS = 0.04


def _atempo_chain(ratio: float) -> str:
    """Build an atempo filter chain. Each atempo stage must stay in [0.5, 2.0]."""
    try:
        value = float(ratio)
    except (TypeError, ValueError):
        value = 1.0
    if value <= 0:
        value = 1.0
    stages: list[str] = []
    while value > 2.0:
        stages.append("atempo=2.0")
        value /= 2.0
    while value < 0.5:
        stages.append("atempo=0.5")
        value /= 0.5
    stages.append(f"atempo={value:.6f}")
    return ",".join(stages)


def fit_mp3_to_duration_bytes(
    data: bytes,
    target_seconds: float,
    *,
    tolerance_seconds: float = DURATION_TOLERANCE_SECONDS,
) -> bytes:
    """Return MP3 bytes whose probed length matches ``target_seconds``.

    Short scenes are padded with trailing silence. Long scenes are sped with
    ``atempo`` then trimmed/padded so the still window and VO clock stay identical.
    """
    payload = bytes(data or b"")
    if not payload:
        raise RuntimeError("cannot fit empty audio to a timed-script scene")
    try:
        target = float(target_seconds)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid target duration {target_seconds!r}") from exc
    target = max(1.0, target)
    actual = probe_audio_duration_bytes(payload)
    if actual <= 0:
        raise RuntimeError(f"could not probe audio duration ({actual})")
    if abs(actual - target) <= tolerance_seconds:
        return payload
    if not shutil.which(ffmpeg_bin()) and not Path(ffmpeg_bin()).exists():
        raise RuntimeError("ffmpeg is not available to fit timed-script voiceover")

    filters: list[str] = []
    if actual > target + tolerance_seconds:
        filters.append(_atempo_chain(actual / target))
    # Nail the clock: trim then pad so Remotion clip boundaries and VO match.
    filters.append(f"atrim=0:{target:.6f}")
    filters.append("asetpts=PTS-STARTPTS")
    filters.append(f"apad=whole_dur={target:.6f}")

    with tempfile.TemporaryDirectory(prefix="vo-fit-") as tmp:
        root = Path(tmp)
        source = root / "in.mp3"
        output = root / "out.mp3"
        source.write_bytes(payload)
        cmd = [
            ffmpeg_bin(),
            "-hide_banner",
            "-nostats",
            "-y",
            "-i",
            str(source),
            "-af",
            ",".join(filters),
            "-t",
            f"{target:.6f}",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output),
        ]
        result = _run(cmd)
        if result.returncode != 0 or not output.exists() or output.stat().st_size <= 0:
            detail = (result.stderr or result.stdout or "ffmpeg fit failed")[-2000:]
            raise RuntimeError(detail)
        fitted = output.read_bytes()
    fitted_seconds = probe_audio_duration_bytes(fitted)
    if abs(fitted_seconds - target) > max(0.12, tolerance_seconds * 3):
        raise RuntimeError(
            f"fitted voiceover is {fitted_seconds:.3f}s but scene window is {target:.3f}s"
        )
    return fitted
