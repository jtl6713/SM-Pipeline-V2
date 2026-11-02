"""Trusted private Google Drive/image/watermark backend for gallery review V2.

No write to the original Output, Content Item or Carousel Slides. Native
galleries may use only the explicitly approved, verified shared ChicagoShining
brand asset; ordinary cross-profile source media remain forbidden.

The review job coordinator supplies durable hold/lease/ledger operations.
"""
from __future__ import annotations

import hashlib
from io import BytesIO
import re
from typing import Callable, Any

from PIL import Image, ImageOps, ImageChops
from branding.watermark import watermark_photo_bytes
from carousel.image_gen import generate_carousel_png

OUTPUT_SIZE = {"4:5": (1080, 1350), "1:1": (1080, 1080),
               "9:16": (1080, 1920), "16:9": (1920, 1080)}
REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
FOLDER = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
NAME = re.compile(r"review-rec[A-Za-z0-9]{14}-[A-Za-z0-9_-]{8,120}-[0-9]{2}\.png\Z")


class GalleryMediaDenied(ValueError):
    pass


def deny(message: str):
    raise GalleryMediaDenied(message)


def _png(value: bytes, *, min_edge: int = 128) -> Image.Image:
    if not isinstance(value, bytes) or len(value) < 128 or not value.startswith(b"\x89PNG\r\n\x1a\n"):
        deny("gallery_png_required")
    try:
        with Image.open(BytesIO(value)) as image:
            if image.format != "PNG":
                deny("gallery_png_required")
            image.load()
            if not (min_edge <= image.width <= 12000 and min_edge <= image.height <= 12000):
                deny("gallery_image_dimensions_invalid")
            return image.copy()
    except (OSError, ValueError) as exc:
        raise GalleryMediaDenied("gallery_png_unreadable") from exc


class GalleryMediaIO:
    @classmethod
    def from_profile_catalog(cls, *, client, drive, profile_id,
                             staging_folder_id, generator=generate_carousel_png,
                             watermarker=watermark_photo_bytes, shared_watermark_enabled=True):
        # The shared-branding exception does not authorize foreign content.
        from rendering_review.profile_watermark import resolve_native_gallery_watermark
        owned=resolve_native_gallery_watermark(client=client,drive=drive,
            profile_id=profile_id,shared_policy_enabled=shared_watermark_enabled)
        return cls(profile_id=profile_id,profile_watermark=owned["bytes"],
                   profile_watermark_receipt=owned["receipt"],
                   drive=drive,staging_folder_id=staging_folder_id,
                   generator=generator,watermarker=watermarker)

    def __init__(self, *, profile_id: str, profile_watermark: bytes,
                 profile_watermark_receipt: dict[str, Any],
                 drive: Any, staging_folder_id: str,
                 generator: Callable = generate_carousel_png,
                 watermarker: Callable = watermark_photo_bytes):
        if not REC.fullmatch(str(profile_id or "")) or not FOLDER.fullmatch(str(staging_folder_id or "")):
            deny("gallery_profile_or_staging_folder_invalid")
        receipt = profile_watermark_receipt
        if (not isinstance(receipt, dict) or
            receipt.get("verified") is not True or receipt.get("authority") != "server" or
            receipt.get("profile_id") != profile_id or
            receipt.get("media_authority") != "google_drive" or
            not FOLDER.fullmatch(str(receipt.get("drive_file_id") or "")) or
            not isinstance(profile_watermark, bytes) or
            hashlib.sha256(profile_watermark).hexdigest() != receipt.get("sha256")):
            deny("gallery_profile_branding_not_authoritative")
        _png(profile_watermark,min_edge=1)
        if not all(callable(getattr(drive, n, None))
                   for n in ("upload_file", "get_file", "download_file")):
            deny("gallery_google_drive_unavailable")
        if not callable(generator) or not callable(watermarker):
            deny("gallery_generation_adapter_missing")
        self.profile_id = profile_id
        self.profile_watermark = profile_watermark
        self.drive = drive
        self.folder = staging_folder_id
        self.generator = generator
        self.watermarker = watermarker
        self.requested_size = None
        self.issued_ids: set[str] = set()

    def generate_image(self, prompt: str, ratio: str) -> bytes:
        if ratio not in OUTPUT_SIZE or not isinstance(prompt, str) or not 8 <= len(prompt.strip()) <= 3000:
            deny("gallery_untrusted_generation_request")
        raw = self.generator(prompt, ratio=ratio)
        source = _png(raw)
        # The existing C5 image generator often returns 1024x1536 for 4:5;
        # materialize a deterministic center-fit at the exact platform ratio.
        # Subject placement must be reviewed by the human before approval.
        size = OUTPUT_SIZE[ratio]
        fitted = ImageOps.fit(source.convert("RGB"), size, method=Image.Resampling.LANCZOS)
        stream = BytesIO()
        fitted.save(stream, format="PNG", optimize=True)
        self.requested_size = size
        return stream.getvalue()

    def watermark_image(self, media: bytes, profile_id: str) -> bytes:
        if profile_id != self.profile_id or self.requested_size is None:
            deny("gallery_watermark_profile_mismatch")
        original = _png(media)
        if original.size != self.requested_size:
            deny("gallery_source_image_size_changed")
        watermarked = self.watermarker(media,self.profile_watermark,output_format="png")
        result = _png(watermarked)
        if result.size != self.requested_size:
            deny("gallery_watermarked_dimensions_changed")
        # A successful C6 invocation does not prove the logo is visible.
        # For the existing deterministic compositor the actual decoded
        # pixels must change; a no-op or metadata-only rewrite is not branding.
        if ImageChops.difference(original.convert("RGB"),
                                 result.convert("RGB")).getbbox() is None:
            deny("gallery_watermark_pixels_unchanged")
        return watermarked

    def upload_image(self, filename: str, content: bytes) -> dict:
        if not NAME.fullmatch(str(filename or "")) or not isinstance(content, bytes):
            deny("gallery_staging_upload_identity_invalid")
        image = _png(content)
        if image.size != self.requested_size:
            deny("gallery_staging_media_dimensions_changed")
        response = self.drive.upload_file(self.folder,filename,content,"image/png")
        fid = response.get("id") if isinstance(response,dict) else None
        if not FOLDER.fullmatch(str(fid or "")) or fid in self.issued_ids:
            deny("gallery_drive_upload_identity_invalid")
        self.issued_ids.add(fid)
        return {"id":fid}

    def verify_drive_image(self, file_id: str, expected_sha: str, expected_bytes: int) -> dict:
        if file_id not in self.issued_ids:
            deny("gallery_uploaded_file_not_owned")
        meta=self.drive.get_file(file_id)
        if (meta.get("id")!=file_id or meta.get("mimeType")!="image/png" or
            self.folder not in (meta.get("parents") or []) or
            meta.get("trashed") is True):
            deny("gallery_staged_drive_parent_or_mime_invalid")
        raw,mime=self.drive.download_file(file_id)
        if mime!="image/png" or not isinstance(raw,bytes) or len(raw)!=expected_bytes or (
            hashlib.sha256(raw).hexdigest()!=expected_sha
        ):
            deny("gallery_staged_drive_content_changed")
        dims=_png(raw).size
        if dims!=self.requested_size:
            deny("gallery_staged_drive_dimensions_changed")
        return {
            "google_drive_verified":True,"sha256":expected_sha,
            "byte_count":len(raw),"mime_type":"image/png",
            "width":dims[0],"height":dims[1],
        }
