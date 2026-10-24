"""Fail-closed visual provenance screen for newly ingested Studio images and clips.

Checks *visible overlays* only, not underlying rights or image metadata.
Raw media is never modified. An uncertain/failed scan requires review.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps, UnidentifiedImageError

from a3.openai_classify import classify_asset

logger = logging.getLogger(__name__)
SIGNATURE = "QA-ASSET-THIRD-PARTY-OVERLAY"
MAX_FRAMES = 5
MAX_IMAGE_PIXELS = 90_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

_PROMPT = """You are the Studio library's visual provenance preflight.
Analyze EVERY supplied frame/photo for *visibly embedded third-party overlays*.
Return only JSON: {"decision":"clean|review|blocked",
"indicators":["watermark|logo|copyright_credit|source_url|social_handle|contact_detail|qr_code|other"],
"evidence":"brief visual evidence, including approximate location in frame"}.

BLOCKED: an unmistakable third-party stock-photo/video watermark, creator/studio mark,
embedded copyright/photographer/source credit, publisher/website URL, social account
handle, phone/email/contact overlay, QR code or third-party branded corner bug.
REVIEW: similar but ambiguous/partially obscured overlays, or uncertainty about
the text/logo. CLEAN: confidently no disallowed overlay visible in the supplied media.
Third-party names *in the pictured environment* (store signs, billboards,
street signs, building facades, vehicle brands) are NOT overlays.
Ordinary scene text is not an overlay. Do not flag first-party ChicagoShining,
New York Shining, Los Angeles Shining, Miami Shining, or Shining Cities marks.
These marks are allowed solely for this visual-overlay check, not as proof of rights.
Do not infer overlays from the file name or unseen frames. Do not claim to
have checked the entire video; these are representative samples.
When uncertain choose review, not clean. No removal or editing of any marks."""

_ALLOWED_INDICATORS = {
    "watermark", "logo", "copyright_credit", "source_url",
    "social_handle", "contact_detail", "qr_code", "other",
}


def _review(reason: str, frames: int = 0) -> dict[str, Any]:
    return {
        "signature": SIGNATURE, "decision": "review",
        "indicators": [], "evidence": str(reason)[:300],
        "frames_checked": frames,
    }


def normalize_screen_result(raw: Any, *, frames_checked: int) -> dict[str, Any]:
    """Never turn a malformed or contradictory model response into approval."""
    if not isinstance(raw, dict):
        return _review("Invalid visual-screen response", frames_checked)
    decision = str(raw.get("decision") or "").strip().lower()
    indicators = raw.get("indicators")
    if decision not in {"clean", "review", "blocked"} or not isinstance(indicators, list):
        return _review("Invalid visual-screen decision", frames_checked)
    if len(indicators) > 12 or any(str(tag) not in _ALLOWED_INDICATORS for tag in indicators):
        return _review("Invalid visual-screen indicator", frames_checked)
    indicators = list(dict.fromkeys(str(tag) for tag in indicators))
    evidence = str(raw.get("evidence") or "").strip()[:300]
    if decision == "clean" and (indicators or not evidence):
        return _review("Contradictory or unexplained clean screen", frames_checked)
    if decision == "blocked" and (not indicators or not evidence):
        return _review("Missing evidence for blocked screen", frames_checked)
    return {
        "signature": SIGNATURE, "decision": decision,
        "indicators": indicators, "evidence": evidence,
        "frames_checked": frames_checked,
    }


def media_requires_screen(filename: str, mime_type: str, route: str = "") -> bool:
    """Catch mislabeled octet-stream photos and intended branding assets too."""
    ext = Path(str(filename or "")).suffix.lower()
    mime = str(mime_type or "").lower()
    return (
        route == "branding"
        or mime.startswith(("image/", "video/"))
        or ext in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
                   ".gif", ".avif", ".mp4", ".mov", ".m4v", ".webm"}
    )


def _photo_jpeg(data: bytes, filename: str = "") -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.seek(0)
            image = ImageOps.exif_transpose(source)
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions exceed safe visual-screen limit")
            image.thumbnail((1280, 1280))
            if image.mode != "RGB":
                image = image.convert("RGB")
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=78)
            return output.getvalue()
    except (UnidentifiedImageError, OSError):
        # Pillow may lack HEIC/HEIF/AVIF codecs on a runner; ffmpeg is bundled.
        if Path(filename or "").suffix.lower() not in {".heic", ".heif", ".avif"}:
            raise
        with tempfile.TemporaryDirectory(prefix="studio-image-screen-") as folder:
            source = Path(folder) / ("source" + Path(filename).suffix.lower())
            source.write_bytes(data)
            frame = subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error",
                 "-i", str(source), "-frames:v", "1", "-vf",
                 "scale='min(1280,iw)':-2", "-f", "image2pipe",
                 "-vcodec", "mjpeg", "-"],
                capture_output=True, timeout=45, check=True,
            )
            if not frame.stdout:
                raise ValueError("HEIC image could not be decoded for screen")
            return frame.stdout


def _video_jpegs(content: bytes, filename: str) -> list[bytes]:
    suffix = Path(filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".m4v", ".webm"}:
        suffix = ".mp4"
    with tempfile.TemporaryDirectory(prefix="studio-visual-screen-") as folder:
        path = Path(folder) / ("source" + suffix)
        path.write_bytes(content)
        duration_probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30, check=True,
        )
        duration = float((duration_probe.stdout or "").strip())
        if not 0 < duration < 24 * 3600:
            raise ValueError("Video duration could not be verified")
        offsets = sorted({round(min(max(0, duration - 0.05), duration * p), 2)
                          for p in (0.02, 0.25, 0.5, 0.75, 0.95)})
        samples = []
        for position in offsets[:MAX_FRAMES]:
            frame = subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(position),
                 "-i", str(path), "-frames:v", "1",
                 "-vf", "scale='min(960,iw)':-2",
                 "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
                capture_output=True, timeout=45, check=True,
            )
            if frame.stdout:
                samples.append(frame.stdout)
        return samples


def screen_asset(*, content: bytes, filename: str, mime_type: str = "",
                 profile_name: str = "") -> dict[str, Any]:
    """Screen a new source upload before sharing/cataloging it.

    Every unsupported format, sampling error, model failure, or ambiguous result
    returns review rather than allowing the file into the production library.
    """
    mime = str(mime_type or "").lower()
    extension = Path(filename or "").suffix.lower()
    is_video = mime.startswith("video/") or extension in {".mp4", ".mov", ".m4v", ".webm"}
    is_image = mime.startswith("image/") or extension in {
        ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".avif",
    }
    if not content or not (is_video or is_image):
        return _review("Missing or unsupported visual media")
    try:
        frames = _video_jpegs(content, filename) if is_video else [_photo_jpeg(content, filename)]
        if not frames:
            return _review("No usable visual frames could be sampled")
        images = ["data:image/jpeg;base64," + base64.b64encode(frame).decode("ascii")
                  for frame in frames]
        result = classify_asset(
            _PROMPT + "\nProfile for first-party mark context: " + str(profile_name or "Unspecified")[:100],
            image_urls=images,
            max_output_tokens=550,
        )
        return normalize_screen_result(result.get("parsed"), frames_checked=len(frames))
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError,
            UnidentifiedImageError) as exc:
        logger.warning("%s screen requires review for %s: %s", SIGNATURE, filename, type(exc).__name__)
        return _review("Visual screening unavailable or inconclusive")
    except Exception:
        logger.exception("%s unexpected visual screening error for %s", SIGNATURE, filename)
        return _review("Visual screening unavailable or inconclusive")


def screening_note(result: dict[str, Any]) -> str:
    """Human-readable audit detail in existing Airtable metadata, bounded in size."""
    return (
        f"{SIGNATURE}: {result.get('decision', 'review').upper()} "
        f"[{', '.join(result.get('indicators') or []) or 'none'}]; "
        f"{str(result.get('evidence') or '')[:250]}; "
        f"frames_checked={int(result.get('frames_checked') or 0)}"
    )[:450]
