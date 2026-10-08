"""Detect near-silent TTS segments so timed-script scenes can be retried."""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from audio.leading_silence import ffmpeg_bin

# Scene 5 on Calle Ocho (CI 395) arrived at max_volume ≈ -21.6 dB while sibling
# spoken scenes sat near -2 dB. Loudnorm can lift that relative gap, but it also
# amplifies noise when ElevenLabs returns near-silence. Reject anything this
# quiet and ask TTS again before the per-scene loudness pass.
MIN_MAX_VOLUME_DB = -18.0
QUIET_TTS_ATTEMPTS = 3

_MAX_VOLUME = re.compile(r"max_volume:\s*(-?[0-9.]+)\s*dB", re.IGNORECASE)


def parse_max_volume_db(stderr: str) -> float | None:
    matches = [float(match.group(1)) for match in _MAX_VOLUME.finditer(stderr or "")]
    if not matches:
        return None
    return matches[-1]


def probe_max_volume_db(data: bytes, *, filename: str = "scene.mp3") -> float | None:
    """Return ffmpeg volumedetect max_volume in dB, or None when probe fails."""
    payload = data or b""
    if not payload:
        return None
    suffix = Path(str(filename or "scene.mp3")).suffix.lower() or ".mp3"
    if suffix not in {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}:
        suffix = ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(payload)
        path = Path(handle.name)
    try:
        result = subprocess.run(
            [
                ffmpeg_bin(),
                "-hide_banner",
                "-nostats",
                "-i",
                str(path),
                "-af",
                "volumedetect",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        # volumedetect writes to stderr even on success.
        return parse_max_volume_db(result.stderr or "")
    except OSError:
        return None
    finally:
        path.unlink(missing_ok=True)


def is_quiet_speech(
    data: bytes,
    *,
    min_max_volume_db: float = MIN_MAX_VOLUME_DB,
    filename: str = "scene.mp3",
) -> bool:
    """True when the clip's peak is below the speech floor (or unreadable/empty)."""
    measured = probe_max_volume_db(data, filename=filename)
    if measured is None:
        # Fail open when ffmpeg is unavailable so production still proceeds;
        # the per-scene loudnorm pass remains the leveling backstop.
        return False
    return measured < float(min_max_volume_db)
