"""Native-gallery authoritative preflight: actual Airtable joins and Drive bytes.

Read-only. A verified watermark *asset* is not evidence that an original photo
contains the mark. No public access, generation, approval or posting occurs.
"""
from __future__ import annotations

import hashlib
import json
import re
from io import BytesIO
from PIL import Image, UnidentifiedImageError

from airtable.constants import (
    CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, CAROUSEL_SLIDES_TABLE,
    MEDIA_ASSETS_TABLE,
)
from rendering_review.profile_watermark import resolve_native_gallery_watermark

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
DRIVE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
MIMES = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
VARIANTS = {"4:5": "Asset_4x5_File_ID", "1:1": "Asset_1x1_File_ID",
            "9:16": "Asset_9x16_File_ID"}
MAX_SLIDES = 20
MAX_FILE_BYTES = 30_000_000
MAX_TOTAL_BYTES = 150_000_000


class GalleryPreflightDenied(ValueError):
    pass


def deny(reason):
    raise GalleryPreflightDenied(reason)


def only_link(value):
    if isinstance(value, list) and len(value) == 1:
        item = value[0]
        if isinstance(item, dict):
            item = item.get("id")
        if isinstance(item, str) and REC.fullmatch(item):
            return item
    return None


def links(value):
    if not isinstance(value, list):
        return []
    return [x.get("id") if isinstance(x, dict) else x for x in value]


def select(value):
    return value.get("name", "") if isinstance(value, dict) else str(value or "")


def fields(record, identity):
    if not isinstance(record, dict) or record.get("id") != identity or not isinstance(
        record.get("fields"), dict
    ):
        deny("gallery_airtable_record_not_authoritative")
    return record["fields"]


def matching_owned_media(client, profile_id, drive_id):
    # Exact Drive ID is syntax-checked before composing a formula. Two results
    # are an ambiguity, never first-record-wins.
    rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        formula='{Google Drive File ID}="' + drive_id + '"',
        max_records=2,
    )
    if not isinstance(rows, list) or len(rows) != 1:
        deny("gallery_source_media_rights_record_missing_or_ambiguous")
    row = rows[0]
    f = fields(row, row.get("id"))
    if (only_link(f.get("Content_Profile")) != profile_id or
            f.get("Rights_Status") != "Owned" or
            f.get("Asset_Status") != "Available" or
            f.get("Active") is not True or f.get("Do_Not_Use") is True or
            f.get("Google Drive File ID") != drive_id or
            f.get("Media_Class") not in ("Image", "Graphic")):
        deny("gallery_source_media_rights_or_profile_denied")
    return row["id"]


def actual_image(drive, file_id):
    meta = drive.get_file(file_id)
    if not isinstance(meta, dict) or meta.get("id") != file_id or (
        meta.get("trashed") is True or meta.get("mimeType") not in MIMES
    ):
        deny("gallery_original_drive_metadata_invalid")
    try:
        declared_size = int(meta.get("size", 0))
    except (TypeError, ValueError):
        deny("gallery_original_drive_size_invalid")
    if not 1024 <= declared_size <= MAX_FILE_BYTES:
        deny("gallery_original_drive_size_invalid")
    data, mime = drive.download_file(file_id)
    if not isinstance(data, bytes) or mime != meta["mimeType"] or len(data) != declared_size:
        deny("gallery_original_drive_readback_mismatch")
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            width, height, fmt = image.width, image.height, image.format
    except (OSError, ValueError, UnidentifiedImageError) as exc:
        raise GalleryPreflightDenied("gallery_original_decoding_failed") from exc
    if (fmt != MIMES[mime] or not 128 <= width <= 12000 or
            not 128 <= height <= 12000):
        deny("gallery_original_image_invalid")
    return {"mime_type": mime, "width": width, "height": height,
            "byte_count": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def read_authoritative_gallery_source(*, client, drive, output_id, expected_profile_id,
                                     branding_resolver=resolve_native_gallery_watermark):
    """Read actual Airtable Output/Item/Slide/Media and independently hash Drive.

    Caller must authenticate the service and (in Studio) enforce profile scope.
    This returned receipt is *not* a launch authorization: the original brand
    placement and durable hold/lease have separate outstanding gates.
    """
    if not REC.fullmatch(str(output_id or "")) or not REC.fullmatch(str(expected_profile_id or "")):
        deny("gallery_output_or_profile_invalid")
    out = fields(client.get_record(PLATFORM_OUTPUTS_TABLE, output_id), output_id)
    content_id = only_link(out.get("Content_Item"))
    if content_id is None:
        deny("gallery_content_item_link_invalid")
    content = fields(client.get_record(CONTENT_ITEMS_TABLE, content_id), content_id)
    actual_profile = only_link(content.get("Content_Profile"))
    if actual_profile != expected_profile_id:
        deny("gallery_profile_not_authorized")
    slide_ids = links(out.get("Carousel Slides"))
    if (not 1 <= len(slide_ids) <= MAX_SLIDES or
            any(not REC.fullmatch(str(x or "")) for x in slide_ids) or
            len(set(slide_ids)) != len(slide_ids)):
        deny("gallery_slide_links_missing_or_unbounded")
    platform = select(out.get("Platform"))
    rows = []
    for slide_id in slide_ids:
        row = fields(client.get_record(CAROUSEL_SLIDES_TABLE, slide_id), slide_id)
        rows.append((slide_id, row))
    rows.sort(key=lambda x: x[1].get("Slide Number", 0))
    aspect = None
    artifacts = []
    seen_files = set()
    total_size = 0
    for index, (slide_id, f) in enumerate(rows, start=1):
        ratio = select(f.get("Aspect Ratio"))
        if (type(f.get("Slide Number")) is not int or f["Slide Number"] != index or
                ratio not in VARIANTS or
                (aspect is not None and ratio != aspect) or
                only_link(f.get("Content Item")) != content_id or
                output_id not in links(f.get("Platform Output")) or
                select(f.get("Platform")) != platform or
                f.get("Deleted From Carousel") is True or
                f.get("Approved For Final") is not True or
                select(f.get("Review Status")) != "Final Approved"):
            deny("gallery_slide_scope_or_approval_invalid")
        aspect = ratio
        file_id = str(f.get(VARIANTS[ratio]) or "")
        if not DRIVE.fullmatch(file_id) or file_id in seen_files:
            deny("gallery_original_drive_id_missing_or_duplicate")
        seen_files.add(file_id)
        asset_id = matching_owned_media(client, expected_profile_id, file_id)
        verified = actual_image(drive, file_id)
        a, b = map(int, ratio.split(":"))
        if abs(verified["width"] / verified["height"] - a / b) > .015:
            deny("gallery_original_aspect_ratio_changed")
        total_size += verified["byte_count"]
        if total_size > MAX_TOTAL_BYTES:
            deny("gallery_original_batch_too_large")
        artifacts.append({
            "slot_id": slide_id, "order": index,
            "drive_file_id": file_id, "source_media_asset_id": asset_id,
            "content_item_id": content_id,
            "profile_id": expected_profile_id, "output_id": output_id,
            "rights_verified": True, "airtable_identity_verified": True,
            # Source branding is NOT inferred from the existence of an
            # owned watermark asset; requires independent pixel evidence.
            "watermark_verified": False, **verified,
        })
    branding = branding_resolver(client=client, drive=drive, profile_id=expected_profile_id)
    if (not isinstance(branding, dict) or
            branding.get("receipt", {}).get("verified") is not True or
            branding["receipt"].get("profile_id") != expected_profile_id):
        deny("gallery_shared_branding_unverified")
    digest = hashlib.sha256(json.dumps(artifacts, sort_keys=True,
        separators=(",", ":")).encode()).hexdigest()
    return {
        "ok": True, "authority": "airtable_and_google_drive",
        "output_id": output_id, "content_item_id": content_id,
        "profile_id": expected_profile_id, "platform": platform,
        "aspect_ratio": aspect, "slide_count": len(artifacts),
        "original_artifacts_sha256": digest,
        "sources_byte_verified": True, "source_rights_verified": True,
        "shared_watermark_asset_verified": True,
        "original_artifact_watermark_verified": False,
        "publication_hold_verified": False,
        "can_generate": False, "can_approve": False,
        "publication_authorized": False,
        "blockers": ["GALLERY_ORIGINAL_BRANDING_PLACEMENT_NOT_VERIFIED",
                     "GALLERY_DURABLE_HOLD_AND_LEASE_REQUIRED"],
        "artifacts": artifacts,
    }
