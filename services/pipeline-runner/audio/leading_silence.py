"""Cap leading digital silence so no more than 0.5s remains."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from asset.routing import audio_role_fallback
from carousel.timeutil import iso_utc

MAX_LEADING_SILENCE_SECONDS = 0.5
SILENCE_NOISE_DB = -50
SILENCE_MIN_DURATION = 0.05
LEADING_START_TOLERANCE = 0.02
MIN_REMAINING_SECONDS = 1.0
STATUS_NOT_NEEDED = "Not Needed"
STATUS_CAPPED = "Capped"
STATUS_FAILED = "Failed"

_SILENCE_START = re.compile(r"silence_start:\s*([0-9.]+)")
_SILENCE_END = re.compile(r"silence_end:\s*([0-9.]+)")


@dataclass(frozen=True)
class LeadingSilenceResult:
    status: str
    leading_silence_seconds: float
    removed_seconds: float
    content: bytes
    changed: bool
    error: str = ""

    def airtable_fields(self) -> dict[str, object]:
        return {
            "Leading_Silence_Status": self.status,
            "Leading_Silence_Removed_Seconds": round(self.removed_seconds, 3),
            "Leading_Silence_Processed_At": iso_utc(),
        }

    def public_dict(self) -> dict[str, object]:
        return {
            "leading_silence_status": self.status,
            "leading_silence_seconds": round(self.leading_silence_seconds, 3),
            "leading_silence_removed_seconds": round(self.removed_seconds, 3),
            "leading_silence_changed": self.changed,
            "file_size_bytes": len(self.content),
            "leading_silence_error": self.error or None,
        }


def is_voiceover_audio(*, filename: str = "", role: str = "") -> bool:
    if str(role or "").strip().casefold() == "voiceover":
        return True
    return audio_role_fallback("", filename) == "Voiceover"


def ffmpeg_bin() -> str:
    return str(os.environ.get("FFMPEG_PATH") or "ffmpeg").strip() or "ffmpeg"


def ffprobe_bin() -> str:
    configured = str(os.environ.get("FFPROBE_PATH") or "").strip()
    if configured:
        return configured
    ffmpeg = Path(ffmpeg_bin())
    sibling = ffmpeg.with_name("ffprobe.exe" if ffmpeg.suffix.lower() == ".exe" else "ffprobe")
    if sibling.exists():
        return str(sibling)
    return "ffprobe"


def parse_leading_silence_seconds(stderr: str) -> float:
    starts = [float(match.group(1)) for match in _SILENCE_START.finditer(stderr or "")]
    ends = [float(match.group(1)) for match in _SILENCE_END.finditer(stderr or "")]
    if not starts or starts[0] > LEADING_START_TOLERANCE:
        return 0.0
    if not ends:
        return 0.0
    return max(0.0, ends[0])


def cut_seconds_for_leading(leading_seconds: float) -> float:
    if leading_seconds <= MAX_LEADING_SILENCE_SECONDS:
        return 0.0
    return round(leading_seconds - MAX_LEADING_SILENCE_SECONDS, 3)


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def _suffix(filename: str) -> str:
    suffix = Path(str(filename or "track.mp3")).suffix.lower()
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}:
        return suffix
    return ".mp3"


def _detect_leading(input_path: Path) -> float:
    result = _run([
        ffmpeg_bin(),
        "-hide_banner",
        "-nostats",
        "-i",
        str(input_path),
        "-af",
        f"silencedetect=noise={SILENCE_NOISE_DB}dB:d={SILENCE_MIN_DURATION}",
        "-f",
        "null",
        "-",
    ])
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "silencedetect failed")[-2000:])
    return parse_leading_silence_seconds(result.stderr or "")


def _probe_duration(input_path: Path) -> float:
    result = _run([
        ffprobe_bin(),
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(input_path),
    ])
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "ffprobe failed")[-2000:])
    try:
        return float((result.stdout or "").strip())
    except ValueError as exc:
        raise RuntimeError("ffprobe did not return a duration") from exc


def _trim(input_path: Path, output_path: Path, cut: float) -> None:
    copy = _run([
        ffmpeg_bin(),
        "-hide_banner",
        "-nostats",
        "-y",
        "-i",
        str(input_path),
        "-ss",
        f"{cut:.3f}",
        "-c",
        "copy",
        str(output_path),
    ])
    if copy.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
        return
    encode = _run([
        ffmpeg_bin(),
        "-hide_banner",
        "-nostats",
        "-y",
        "-i",
        str(input_path),
        "-ss",
        f"{cut:.3f}",
        "-c:a",
        "libmp3lame" if output_path.suffix.lower() == ".mp3" else "copy",
        str(output_path),
    ])
    if encode.returncode != 0 or not output_path.exists() or output_path.stat().st_size <= 0:
        raise RuntimeError((encode.stderr or copy.stderr or "ffmpeg trim failed")[-2000:])


def cap_leading_silence(content: bytes, filename: str = "track.mp3") -> LeadingSilenceResult:
    payload = content or b""
    if not payload:
        return LeadingSilenceResult(STATUS_FAILED, 0.0, 0.0, payload, False, "Audio file is empty")
    if not shutil.which(ffmpeg_bin()) and not Path(ffmpeg_bin()).exists():
        return LeadingSilenceResult(STATUS_FAILED, 0.0, 0.0, payload, False, "ffmpeg is not available")

    suffix = _suffix(filename)
    try:
        with tempfile.TemporaryDirectory(prefix="cs-lead-silence-") as raw_dir:
            work = Path(raw_dir)
            source = work / f"input{suffix}"
            output = work / f"output{suffix}"
            source.write_bytes(payload)
            leading = _detect_leading(source)
            cut = cut_seconds_for_leading(leading)
            if cut <= 0:
                return LeadingSilenceResult(STATUS_NOT_NEEDED, leading, 0.0, payload, False)
            duration = _probe_duration(source)
            if duration - cut < MIN_REMAINING_SECONDS:
                return LeadingSilenceResult(
                    STATUS_FAILED,
                    leading,
                    0.0,
                    payload,
                    False,
                    f"Trim would leave less than {MIN_REMAINING_SECONDS}s of audio",
                )
            _trim(source, output, cut)
            trimmed = output.read_bytes()
            if not trimmed:
                raise RuntimeError("Trim produced an empty file")
            return LeadingSilenceResult(STATUS_CAPPED, leading, cut, trimmed, True)
    except Exception as exc:
        return LeadingSilenceResult(STATUS_FAILED, 0.0, 0.0, payload, False, str(exc))


def apply_drive_leading_silence(
    drive,
    file_id: str,
    *,
    filename: str,
    mime_type: str,
) -> LeadingSilenceResult:
    content, detected_mime = drive.download_file(file_id)
    result = cap_leading_silence(content, filename)
    if result.changed:
        drive.update_media(file_id, result.content, mime_type or detected_mime or "audio/mpeg")
    return result
