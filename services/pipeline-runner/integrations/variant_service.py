from __future__ import annotations

import io
import os
import subprocess
import tempfile
from typing import Any

import requests
from PIL import Image, UnidentifiedImageError

from config import load_settings
from item4.constants import VARIANT_RECIPE_VERSION
from item4.settings import PipelineSettings

# Cloudflare Images on the variant Worker dies on 20MB+ phone JPEGs
# ("Worker exceeded resource limits" / "Network connection lost").
MAX_VARIANT_SOURCE_BYTES = 3_500_000
MAX_VARIANT_SOURCE_EDGE = 2560
HEIC_FTYP_BRANDS = {
    b"avif",
    b"heic",
    b"heif",
    b"heim",
    b"heis",
    b"heix",
    b"hevc",
    b"hevx",
    b"mif1",
    b"msf1",
}
UNREADABLE_STILL_ERROR = (
    "This photo could not be opened as an image. iPhone HEIC stills need a JPEG "
    "from ffmpeg's assembled tile grid before Studio can crop them. Video clips skip crops."
)


def _ftyp_brand(image_bytes: bytes) -> bytes:
    if len(image_bytes) >= 12 and image_bytes[4:8] == b"ftyp":
        return bytes(image_bytes[8:12])
    return b""


def looks_like_heic_bytes(image_bytes: bytes) -> bool:
    return _ftyp_brand(image_bytes) in HEIC_FTYP_BRANDS


def pillow_image_format(image_bytes: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            fmt = str(image.format or "").strip()
            return fmt or "unknown"
    except Exception:
        return None


def pillow_image_decodable(image_bytes: bytes) -> bool:
    """Return true only when Pillow can read the complete pixel payload."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.load()
        return True
    except Exception:
        return False


def _extension_for_decode(image_bytes: bytes, ext: str = "") -> str:
    cleaned = str(ext or "").strip().lower().lstrip(".")
    if cleaned:
        return cleaned
    if looks_like_heic_bytes(image_bytes):
        return "heic"
    brand = _ftyp_brand(image_bytes)
    if brand == b"qt  ":
        return "mov"
    if brand:
        return "mp4"
    return "bin"


def _drive_jpeg_thumbnail(drive: Any, drive_id: str) -> bytes | None:
    getter = getattr(drive, "download_thumbnail", None) if drive is not None else None
    if not callable(getter) or not str(drive_id or "").strip():
        return None
    try:
        grabbed = getter(drive_id, size="w2560")
    except TypeError:
        grabbed = getter(drive_id)
    except Exception:
        return None
    if not grabbed or not grabbed[0]:
        return None
    return grabbed[0] if pillow_image_decodable(grabbed[0]) else None


def ffmpeg_heic_still(image_bytes: bytes, ext: str = "heic") -> bytes | None:
    """Decode HEIC/HEIF via ffmpeg's default tile grid.

    Do not `-map 0:v:0`. iPhone stills store the photo as many 512px HEVC tiles;
    stream 0 is one tile. Cloudflare Images does the same if it receives raw HEIC,
    which shows up as a stacked 9:16 fill-crop (two mismatched halves).
    """
    suffix = f".{str(ext or 'heic').lstrip('.') or 'heic'}"
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, f"still{suffix}")
            out = os.path.join(tmp, "still.jpg")
            with open(src, "wb") as handle:
                handle.write(image_bytes)
            completed = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    src,
                    "-frames:v",
                    "1",
                    "-update",
                    "1",
                    "-q:v",
                    "2",
                    out,
                ],
                check=False,
                capture_output=True,
                timeout=120,
            )
            if completed.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) < 80:
                return None
            with open(out, "rb") as handle:
                return handle.read()
    except Exception:
        return None


def rasterize_still_bytes(
    image_bytes: bytes,
    *,
    drive: Any = None,
    drive_id: str = "",
    ext: str = "",
) -> bytes:
    """Return Pillow-readable still bytes. HEIC originals become an assembled JPEG first."""
    ext_l = _extension_for_decode(image_bytes, ext)
    if looks_like_heic_bytes(image_bytes) or ext_l in {"heic", "heif"}:
        converted = ffmpeg_heic_still(image_bytes, ext_l)
        if converted and pillow_image_decodable(converted):
            return converted
        thumb = _drive_jpeg_thumbnail(drive, drive_id)
        if thumb:
            return thumb
        raise RuntimeError(UNREADABLE_STILL_ERROR)
    if pillow_image_decodable(image_bytes):
        return image_bytes
    thumb = _drive_jpeg_thumbnail(drive, drive_id)
    if thumb:
        return thumb
    from item4.clip_poster import ffmpeg_poster_frame

    converted = ffmpeg_poster_frame(image_bytes, ext_l)
    if converted and pillow_image_decodable(converted):
        return converted
    raise RuntimeError(UNREADABLE_STILL_ERROR)


def prepare_variant_source(
    image_bytes: bytes,
    *,
    max_bytes: int = MAX_VARIANT_SOURCE_BYTES,
    max_edge: int = MAX_VARIANT_SOURCE_EDGE,
    drive: Any = None,
    drive_id: str = "",
    ext: str = "",
) -> bytes:
    raster = rasterize_still_bytes(image_bytes, drive=drive, drive_id=drive_id, ext=ext)
    if len(raster) <= max_bytes:
        return raster
    try:
        image = Image.open(io.BytesIO(raster))
        image = image.convert("RGB")
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=90, optimize=True)
        prepared = out.getvalue()
        return prepared if prepared else raster
    except UnidentifiedImageError as exc:
        raise RuntimeError(UNREADABLE_STILL_ERROR) from exc


class VariantServiceClient:
    def __init__(self, settings: PipelineSettings | None = None) -> None:
        self._runtime = load_settings()
        self._settings = settings

    def _base_url(self) -> str:
        env_url = str(self._runtime.get("variant_service_url") or "").rstrip("/")
        if env_url:
            return env_url
        if self._settings:
            return self._settings.get("STUDIO_VARIANT_SERVICE_BASE_URL").rstrip("/")
        raise RuntimeError("STUDIO_VARIANT_SERVICE_BASE_URL is not configured")

    def _token(self) -> str:
        env_token = str(self._runtime.get("variant_service_token") or "").strip()
        if env_token:
            return env_token
        if self._settings:
            return self._settings.get("STUDIO_VARIANT_SERVICE_TOKEN")
        raise RuntimeError("STUDIO_VARIANT_SERVICE_TOKEN is not configured")

    def render(
        self,
        image_bytes: bytes,
        ratio: str,
        gravity: str = "center",
        *,
        drive: Any = None,
        drive_id: str = "",
        ext: str = "",
    ) -> bytes:
        base = self._base_url()
        token = self._token()
        payload = prepare_variant_source(
            image_bytes,
            drive=drive,
            drive_id=drive_id,
            ext=ext,
        )
        params = {
            "ratio": ratio,
            "recipe": VARIANT_RECIPE_VERSION,
            "g": gravity or "center",
        }
        response = requests.post(
            f"{base}/render",
            params=params,
            data=payload,
            headers={
                "X-Studio-Variant-Token": token,
                "Content-Type": "application/octet-stream",
            },
            timeout=300,
        )
        if not response.ok:
            detail = response.text[:500]
            raise RuntimeError(f"Variant service failed ({response.status_code}): {detail}")
        return response.content

    def health(self) -> dict[str, Any]:
        base = self._base_url()
        response = requests.get(f"{base}/health", timeout=30)
        response.raise_for_status()
        return response.json()
