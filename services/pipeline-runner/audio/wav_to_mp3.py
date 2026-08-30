"""Convert WAV music beds to MP3 so catalog and remotion always get MPEG audio."""

from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from audio.leading_silence import ffmpeg_bin, _run

MP3_MIME = "audio/mpeg"
WAV_MIMES = frozenset({"audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"})


@dataclass(frozen=True)
class WavConvertResult:
    changed: bool
    filename: str
    content: bytes
    mime_type: str
    file_size_bytes: int
    error: str = ""


def is_wav_audio(*, filename: str = "", mime_type: str = "") -> bool:
    suffix = Path(str(filename or "")).suffix.lower()
    mime = str(mime_type or "").strip().casefold()
    return suffix == ".wav" or mime in WAV_MIMES


def mp3_filename(filename: str) -> str:
    stem = Path(str(filename or "").strip() or "track.wav").stem.strip() or "track"
    return f"{stem}.mp3"


def wav_to_mp3(content: bytes, filename: str = "track.wav") -> bytes:
    payload = content or b""
    if not payload:
        raise ValueError("WAV file is empty")
    ffmpeg = ffmpeg_bin()
    if not shutil.which(ffmpeg) and not Path(ffmpeg).exists():
        raise RuntimeError("ffmpeg is not available for WAV to MP3 conversion")

    with tempfile.TemporaryDirectory(prefix="cs-wav-mp3-") as raw_dir:
        work = Path(raw_dir)
        source = work / "input.wav"
        output = work / "output.mp3"
        source.write_bytes(payload)
        encoded = _run([
            ffmpeg,
            "-hide_banner",
            "-nostats",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(output),
        ])
        if encoded.returncode != 0 or not output.exists() or output.stat().st_size <= 0:
            raise RuntimeError((encoded.stderr or encoded.stdout or "WAV to MP3 conversion failed")[-2000:])
        converted = output.read_bytes()
    if not converted:
        raise RuntimeError("WAV to MP3 conversion produced an empty file")
    return converted


def convert_wav_if_needed(
    content: bytes,
    filename: str,
    mime_type: str = "",
) -> WavConvertResult:
    name = str(filename or "").strip() or "track.wav"
    payload = content or b""
    if not is_wav_audio(filename=name, mime_type=mime_type):
        return WavConvertResult(False, name, payload, mime_type or MP3_MIME, len(payload))
    converted = wav_to_mp3(payload, name)
    mp3_name = mp3_filename(name)
    return WavConvertResult(True, mp3_name, converted, MP3_MIME, len(converted))


def apply_drive_wav_to_mp3(
    drive,
    file_id: str,
    *,
    filename: str,
    mime_type: str,
) -> WavConvertResult:
    if not is_wav_audio(filename=filename, mime_type=mime_type):
        return WavConvertResult(False, filename, b"", mime_type or MP3_MIME, 0)
    content, detected_mime = drive.download_file(file_id)
    result = convert_wav_if_needed(content, filename, mime_type or detected_mime)
    if result.changed:
        drive.update_media(file_id, result.content, MP3_MIME)
        if hasattr(drive, "update_metadata"):
            drive.update_metadata(file_id, name=result.filename, mime_type=MP3_MIME)
    return result
