"""Independent original-gallery Drive verification before any native image attempt.

Airtable identity/rights are authoritative inputs provided by the authenticated
server. This adapter reads Google Drive bytes, not browser URLs or metadata-only
Studio inventory. It is read-only and never marks a source owned merely because
its bytes are accessible.
"""
from __future__ import annotations

from io import BytesIO
import hashlib
import re
from PIL import Image, UnidentifiedImageError

RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
DRIVE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
FORMATS = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
RATIOS = {"4:5": (4, 5), "1:1": (1, 1), "9:16": (9, 16), "16:9": (16, 9)}


class SourceVerificationDenied(ValueError):
    pass


def deny(reason):
    raise SourceVerificationDenied(reason)


def verify_original_gallery_sources(*, output_id, profile_id, content_item_id,
                                    aspect_ratio, slides, drive):
    """Verify all slides in exact order against immutable authoritative claims.

    Every slide must have been confirmed by the Airtable identity/rights bridge
    for the same output, Content Item and profile BEFORE calling this function.
    This function independently confirms actual Drive byte/dimension evidence.
    """
    if (not all(RECORD.fullmatch(str(x or "")) for x in
                (output_id, profile_id, content_item_id)) or
            aspect_ratio not in RATIOS or
            not isinstance(slides, list) or not 1 <= len(slides) <= 80 or
            not callable(getattr(drive, "get_file", None)) or
            not callable(getattr(drive, "download_file", None))):
        deny("gallery_original_context_unverified")
    observed = set()
    verified = []
    for order, source in enumerate(slides, 1):
        if not isinstance(source, dict):
            deny("gallery_original_source_invalid")
        fid = source.get("drive_file_id")
        sid = source.get("slot_id")
        if (source.get("order") != order or not isinstance(sid, str) or
                not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", sid) or sid in observed or
                not DRIVE.fullmatch(str(fid or "")) or fid in observed or
                source.get("output_id") != output_id or
                source.get("profile_id") != profile_id or
                source.get("content_item_id") != content_item_id or
                source.get("rights_verified") is not True or
                source.get("watermark_verified") is not True or
                source.get("airtable_identity_verified") is not True or
                source.get("mime_type") not in FORMATS or
                not HASH.fullmatch(str(source.get("sha256") or "")) or
                type(source.get("byte_count")) is not int or
                source["byte_count"] < 1024):
            deny("gallery_original_identity_or_rights_unverified")
        observed.update((sid, fid))
        metadata = drive.get_file(fid)
        if (not isinstance(metadata, dict) or metadata.get("id") != fid or
                metadata.get("trashed") is True or
                metadata.get("mimeType") != source["mime_type"]):
            deny("gallery_original_drive_metadata_mismatch")
        raw, mime = drive.download_file(fid)
        if (not isinstance(raw, bytes) or mime != source["mime_type"] or
                len(raw) != source["byte_count"] or
                hashlib.sha256(raw).hexdigest() != source["sha256"]):
            deny("gallery_original_drive_bytes_mismatch")
        try:
            with Image.open(BytesIO(raw)) as image:
                image.load()
                width, height = image.size
                actual_format = image.format
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            raise SourceVerificationDenied("gallery_original_image_unreadable") from exc
        if (actual_format != FORMATS[mime] or
                type(source.get("width")) is not int or
                type(source.get("height")) is not int or
                (width, height) != (source["width"], source["height"]) or
                not 128 <= width <= 12000 or not 128 <= height <= 12000):
            deny("gallery_original_decoded_image_mismatch")
        a, b = RATIOS[aspect_ratio]
        if abs(width / height - a / b) > 0.015:
            deny("gallery_original_aspect_ratio_mismatch")
        verified.append({
            "slot_id": sid, "order": order, "drive_file_id": fid,
            "output_id": output_id, "profile_id": profile_id,
            "mime_type": mime, "sha256": source["sha256"],
            "byte_count": len(raw), "width": width, "height": height,
            "authority": "server", "verified": True,
            "google_drive_verified": True, "rights_verified": True,
            "canonical_media_authority": "google_drive",
            "watermark_verified": source.get("watermark_verified") is True,
        })
    return verified
