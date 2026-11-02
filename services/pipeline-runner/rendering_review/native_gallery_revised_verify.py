"""Independent Airtable/Drive readback for a proposed private native-gallery V2.

No writes and no public preview URLs. A newly generated image only earns a
review-ready receipt if it is separately catalogued as an owned active asset,
in the configured private revision folder, pixel-branded, and byte-identical
to the exact Worker-owned attempt claim. All unchanged V1 media are immutable.
"""
from __future__ import annotations

import re

from rendering_review.gallery_authoritative import (
    read_authoritative_gallery_source, actual_image, matching_owned_media,
)
from rendering_review.gallery_branding_pixels import visible_source_watermark
from rendering_review.profile_watermark import resolve_native_gallery_watermark

RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
MAX = 20


class RevisedGalleryDenied(ValueError):
    pass


def deny(reason):
    raise RevisedGalleryDenied(reason)


def verify_staged_gallery_revision(
    *, client, drive, output_id, profile_id, content_item_id,
    original_artifacts, revision_artifacts, selected_slide_ids,
    staging_folder_id, source_loader=read_authoritative_gallery_source,
    asset_lookup=matching_owned_media,
    branding_resolver=resolve_native_gallery_watermark,
):
    if not all(RECORD.fullmatch(str(x or "")) for x in
               (output_id, profile_id, content_item_id)) or not FILE.fullmatch(
                   str(staging_folder_id or "")
               ) or not isinstance(original_artifacts, list) or not isinstance(
                   revision_artifacts, list
               ) or not 1 <= len(original_artifacts) <= MAX or len(
                   revision_artifacts
               ) != len(original_artifacts) or not isinstance(
                   selected_slide_ids, list
               ) or not selected_slide_ids or len(selected_slide_ids) > MAX:
        deny("native_gallery_revision_request_invalid")
    selected = set(selected_slide_ids)
    if len(selected) != len(selected_slide_ids) or any(
        not RECORD.fullmatch(str(x or "")) for x in selected
    ):
        deny("native_gallery_revision_selection_invalid")
    source = source_loader(
        client=client, drive=drive, output_id=output_id,
        expected_profile_id=profile_id,
    )
    if source.get("content_item_id") != content_item_id or not source.get(
        "original_artifact_watermark_verified"
    ) or not source.get("sources_byte_verified"):
        deny("native_gallery_revision_source_not_verified")
    originals = source.get("artifacts")
    if originals != original_artifacts:
        deny("native_gallery_revision_original_changed")
    logo = branding_resolver(client=client, drive=drive, profile_id=profile_id)
    if logo.get("receipt", {}).get("verified") is not True:
        deny("native_gallery_revision_brand_not_verified")
    changed = 0
    files = set()
    for old, new in zip(originals, revision_artifacts):
        if not isinstance(new, dict) or new.get("slot_id") != old.get("slot_id") or (
            new.get("order") != old.get("order") or
            new.get("output_id") != output_id or
            new.get("profile_id") != profile_id or
            new.get("content_item_id") != content_item_id or
            new.get("rights_verified") is not True or
            new.get("watermark_verified") is not True or
            not FILE.fullmatch(str(new.get("drive_file_id") or "")) or
            new["drive_file_id"] in files or
            not SHA.fullmatch(str(new.get("sha256") or ""))
        ):
            deny("native_gallery_revision_identity_invalid")
        files.add(new["drive_file_id"])
        if old["slot_id"] not in selected:
            if new != old:
                deny("native_gallery_unchanged_original_changed")
            continue
        if new["drive_file_id"] == old["drive_file_id"] or (
            new["sha256"] == old["sha256"]
        ):
            deny("native_gallery_selected_slide_not_revised")
        metadata = drive.get_file(new["drive_file_id"])
        if (metadata.get("id") != new["drive_file_id"] or
                metadata.get("mimeType") != "image/png" or
                staging_folder_id not in metadata.get("parents", []) or
                metadata.get("trashed") is True):
            deny("native_gallery_revision_not_private_staged_png")
        # The new file must have its OWN exact-profile owned Media Asset
        # identity; do not transfer the original slide's ownership receipt.
        new_media_id = asset_lookup(client, profile_id, new["drive_file_id"])
        if (not RECORD.fullmatch(str(new_media_id or "")) or
                new_media_id == old.get("source_media_asset_id") or
                new.get("revision_media_asset_id") != new_media_id):
            deny("native_gallery_revision_rights_record_invalid")
        actual, raw = actual_image(drive, new["drive_file_id"])
        if any(actual.get(key) != new.get(key) for key in
               ("sha256", "byte_count", "width", "height", "mime_type")):
            deny("native_gallery_revision_drive_bytes_changed")
        a, b = map(int, source["aspect_ratio"].split(":"))
        if abs(actual["width"] / actual["height"] - a / b) > 0.015:
            deny("native_gallery_revision_aspect_mismatch")
        if not visible_source_watermark(raw, logo.get("bytes")):
            deny("native_gallery_revision_watermark_pixels_missing")
        changed += 1
    if changed != len(selected):
        deny("native_gallery_revision_selection_incomplete")
    return True
