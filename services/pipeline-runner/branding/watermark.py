"""Official ChicagoShining photo watermark — C6, native stills, and P2 thumbnails."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import subprocess
import tempfile

import requests
from PIL import Image

from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from carousel.constants import (
    C6_WATERMARK_ASSET_VIEW,
    DEFAULT_WATERMARK_SERVICE_URL,
    SETTING_WATERMARK_URL,
)
from config import load_settings
from item4.settings import pipeline_settings
from integrations.google_drive import GoogleDriveClient
from render.fields import field_str

DEFAULT_POSITION = "top-left"
DEFAULT_SCALE = 0.12
DEFAULT_MARGIN = 30
DEFAULT_OPACITY = 1.0
BRANDED_PATH_MARKERS = ("/lettered/", "/watermarked/")


VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}


def profile_requires_watermark(profile_name: str) -> bool:
    """ChicagoShining visuals must always use the official watermark."""
    normalized = "".join(ch for ch in str(profile_name or "").lower() if ch.isalnum())
    return normalized.startswith("chicagoshining")


def _media_extension(filename: str) -> str:
    return Path(str(filename or "")).suffix.lower()


def watermark_video_bytes(
    video_bytes: bytes,
    watermark_bytes: bytes,
    *,
    filename: str = "clip.mp4",
    position: str = DEFAULT_POSITION,
    scale: float = DEFAULT_SCALE,
    margin: int = DEFAULT_MARGIN,
) -> bytes:
    """Burn the official watermark into every frame of a video clip."""
    if not video_bytes:
        raise RuntimeError("Video watermark input was empty")
    if not watermark_bytes:
        raise RuntimeError("Video watermark asset was empty")
    suffix = _media_extension(filename)
    if suffix not in VIDEO_EXTENSIONS:
        suffix = ".mp4"
    overlay_xy = {
        "top-left": f"{int(margin)}:{int(margin)}",
        "top-right": f"main_w-overlay_w-{int(margin)}:{int(margin)}",
        "bottom-left": f"{int(margin)}:main_h-overlay_h-{int(margin)}",
        "bottom-right": f"main_w-overlay_w-{int(margin)}:main_h-overlay_h-{int(margin)}",
        "center": "(main_w-overlay_w)/2:(main_h-overlay_h)/2",
    }.get(str(position or DEFAULT_POSITION), f"{int(margin)}:{int(margin)}")
    with tempfile.TemporaryDirectory(prefix="studio-watermark-") as tmp:
        root = Path(tmp)
        source = root / f"source{suffix}"
        mark = root / "watermark.png"
        output = root / "watermarked.mp4"
        source.write_bytes(video_bytes)
        mark.write_bytes(watermark_bytes)
        filter_graph = (
            f"[1:v][0:v]scale2ref=w=main_w*{float(scale or DEFAULT_SCALE)}:h=-1[wm][base];"
            f"[base][wm]overlay={overlay_xy}:format=auto[outv]"
        )
        completed = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source),
                "-i",
                str(mark),
                "-filter_complex",
                filter_graph,
                "-map",
                "[outv]",
                "-map",
                "0:a?",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "19",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(output),
            ],
            capture_output=True,
            check=False,
            timeout=900,
        )
        if completed.returncode != 0 or not output.exists() or output.stat().st_size < 100:
            detail = completed.stderr.decode("utf-8", errors="replace")[-1000:]
            raise RuntimeError(f"Video watermark ffmpeg failed: {detail or 'no output'}")
        return output.read_bytes()


def watermark_media_bytes(
    media_bytes: bytes,
    watermark_bytes: bytes,
    *,
    filename: str = "",
    mime_type: str = "",
) -> dict:
    """Return a publication-safe watermarked derivative for a photo or video."""
    ext = _media_extension(filename)
    mime = str(mime_type or "").strip().lower()
    is_video = mime.startswith("video/") or ext in VIDEO_EXTENSIONS
    if is_video:
        branded = watermark_video_bytes(media_bytes, watermark_bytes, filename=filename)
        return {
            "bytes": branded,
            "mime_type": "video/mp4",
            "extension": "mp4",
            "watermarked": True,
        }

    from integrations.variant_service import rasterize_still_bytes

    raster = rasterize_still_bytes(media_bytes, ext=ext.lstrip("."))
    output_format = "png" if ext == ".png" else "jpeg"
    branded = watermark_photo_bytes(raster, watermark_bytes, output_format=output_format)
    return {
        "bytes": branded,
        "mime_type": "image/png" if output_format == "png" else "image/jpeg",
        "extension": "png" if output_format == "png" else "jpg",
        "watermarked": True,
    }


def already_branded_url(url: str) -> bool:
    lower = str(url or "").lower()
    return any(marker in lower for marker in BRANDED_PATH_MARKERS)


def watermark_service_url() -> str:
    settings = load_settings()
    configured = str(settings.get("watermark_service_url") or "").strip()
    from_airtable = pipeline_settings().get(SETTING_WATERMARK_URL)
    return (configured or from_airtable or DEFAULT_WATERMARK_SERVICE_URL).rstrip("/")


def brand_watermark_url(client: AirtableClient) -> str:
    rows = client.list_records(MEDIA_ASSETS_TABLE, view=C6_WATERMARK_ASSET_VIEW, max_records=1)
    if not rows:
        raise RuntimeError("C6 watermark asset view returned no active branding watermark")
    url = field_str(rows[0], "Google Drive URL")
    if not url:
        raise RuntimeError("C6 watermark asset is missing Google Drive URL")
    return url


def brand_watermark_bytes(client: AirtableClient) -> bytes:
    """Load the official watermark using authenticated Drive first.

    Asset Manager ingestion runs on the local Pipeline Runner. The catalog's
    Google Drive URL is not guaranteed to be anonymously downloadable, so a
    plain requests.get() can fail even though the runner itself has Drive
    credentials. Prefer the stored Drive file ID and authenticated Drive
    download; retain URL download only for legacy watermark rows.
    """
    rows = client.list_records(MEDIA_ASSETS_TABLE, view=C6_WATERMARK_ASSET_VIEW, max_records=1)
    if not rows:
        raise RuntimeError("C6 watermark asset view returned no active branding watermark")
    row = rows[0]
    drive_id = field_str(row, "Google Drive File ID")
    if drive_id:
        content, _mime_type = GoogleDriveClient().download_file(drive_id)
        if not content:
            raise RuntimeError("C6 watermark Drive download was empty")
        return content

    url = field_str(row, "Google Drive URL")
    if not url:
        raise RuntimeError("C6 watermark asset is missing Google Drive File ID and URL")
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    if not response.content:
        raise RuntimeError("C6 watermark asset download was empty")
    return response.content


def _position(position: str, base_w: int, base_h: int, wm_w: int, wm_h: int, margin: int) -> tuple[int, int]:
    if position == "top-right":
        return max(0, base_w - wm_w - margin), margin
    if position == "bottom-left":
        return margin, max(0, base_h - wm_h - margin)
    if position == "bottom-right":
        return max(0, base_w - wm_w - margin), max(0, base_h - wm_h - margin)
    if position == "center":
        return max(0, round((base_w - wm_w) / 2)), max(0, round((base_h - wm_h) / 2))
    return margin, margin


def apply_watermark_bytes(
    image_bytes: bytes,
    watermark_bytes: bytes,
    *,
    position: str = DEFAULT_POSITION,
    scale: float = DEFAULT_SCALE,
    margin: int = DEFAULT_MARGIN,
    opacity: float = DEFAULT_OPACITY,
    output_format: str = "png",
) -> bytes:
    base = Image.open(BytesIO(image_bytes)).convert("RGBA")
    width, height = base.size
    if not width or not height:
        raise RuntimeError("Could not read base image dimensions")
    target_width = max(1, round(width * float(scale or DEFAULT_SCALE)))
    mark = Image.open(BytesIO(watermark_bytes)).convert("RGBA")
    ratio = mark.height / max(mark.width, 1)
    target_height = max(1, round(target_width * ratio))
    mark = mark.resize((target_width, target_height), Image.Resampling.LANCZOS)
    if float(opacity or 1) < 1:
        alpha = mark.getchannel("A").point(lambda value: int(value * float(opacity)))
        mark.putalpha(alpha)
    left, top = _position(str(position or DEFAULT_POSITION), width, height, mark.width, mark.height, int(margin))
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    overlay.paste(mark, (left, top), mark)
    composed = Image.alpha_composite(base, overlay)
    out = BytesIO()
    fmt = str(output_format or "png").strip().lower()
    if fmt in {"jpg", "jpeg"}:
        composed.convert("RGB").save(out, format="JPEG", quality=95, optimize=True)
    else:
        composed.save(out, format="PNG")
    return out.getvalue()


def watermark_image_from_url(
    *,
    image_url: str,
    watermark_url: str,
    output_format: str = "png",
) -> bytes:
    service = watermark_service_url()
    response = requests.post(
        f"{service}/watermark-image",
        headers={"Content-Type": "application/json"},
        json={
            "imageUrl": image_url,
            "watermarkUrl": watermark_url,
            "position": DEFAULT_POSITION,
            "scale": DEFAULT_SCALE,
            "margin": DEFAULT_MARGIN,
            "opacity": DEFAULT_OPACITY,
            "outputFormat": output_format,
        },
        timeout=300,
    )
    if not response.ok:
        detail = (response.text or "").strip()[:300]
        raise RuntimeError(f"Watermark service failed ({response.status_code}): {detail}")
    return response.content


def watermark_photo_bytes(
    image_bytes: bytes,
    watermark_bytes: bytes,
    *,
    output_format: str = "jpeg",
) -> bytes:
    return apply_watermark_bytes(
        image_bytes,
        watermark_bytes,
        output_format=output_format,
    )
