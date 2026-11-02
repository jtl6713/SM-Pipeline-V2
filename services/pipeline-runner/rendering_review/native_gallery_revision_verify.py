"""Independently re-read selected revised gallery slides before Airtable commit.

All identities are reloaded from canonical Airtable. Unselected original files
remain bit-identical. Selected revisions must exist in a private Drive staging
folder, be rights-cleared by an exact same-profile Media Asset row, and contain
the approved shared watermark. No writer, public URL or publishing action.
"""
from __future__ import annotations

import hashlib
import json
import re

from rendering_review.gallery_authoritative import (
    read_authoritative_gallery_source, matching_owned_media, actual_image,
    GalleryPreflightDenied,
)
from rendering_review.gallery_branding_pixels import visible_source_watermark
from rendering_review.profile_watermark import resolve_native_gallery_watermark

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
MIME = {"image/png", "image/jpeg", "image/webp"}


class NativeGalleryRevisionVerifyDenied(ValueError):
    pass


def deny(reason):
    raise NativeGalleryRevisionVerifyDenied(reason)


def verify_native_gallery_revision(*, client, drive, output_id, profile_id,
                                   content_item_id, staging_folder_id,
                                   original_manifest_sha256, original_artifacts,
                                   revision_artifacts, selected_slide_ids,
                                   branding_resolver=resolve_native_gallery_watermark):
    if not all(REC.fullmatch(str(x or "")) for x in (
        output_id, profile_id, content_item_id
    )) or not FILE.fullmatch(str(staging_folder_id or "")) or not SHA.fullmatch(
        str(original_manifest_sha256 or "")
    ) or not isinstance(original_artifacts, list) or not isinstance(
        revision_artifacts, list
    ) or not isinstance(selected_slide_ids, list):
        deny("native_gallery_revision_inputs_invalid")
    if not (1 <= len(original_artifacts) == len(revision_artifacts) <= 20 and
            1 <= len(selected_slide_ids) <= len(original_artifacts) and
            len(set(selected_slide_ids)) == len(selected_slide_ids) and
            all(REC.fullmatch(str(x or "")) for x in selected_slide_ids)):
        deny("native_gallery_revision_selection_invalid")

    # Source authorization is not borrowed from the saved frozen manifest.
    # It is refreshed from Airtable Media Assets and actual Google Drive bytes.
    try:
        current = read_authoritative_gallery_source(
            client=client, drive=drive, output_id=output_id,
            expected_profile_id=profile_id,
            branding_resolver=branding_resolver,
        )
    except GalleryPreflightDenied as exc:
        raise NativeGalleryRevisionVerifyDenied(
            "native_gallery_original_revalidation_failed") from exc
    source = current["artifacts"]
    if (current["content_item_id"] != content_item_id or
            current["original_artifacts_sha256"] != original_manifest_sha256 or
            current["original_artifact_watermark_verified"] is not True or
            source != original_artifacts):
        deny("native_gallery_frozen_original_changed")
    branding = branding_resolver(client=client, drive=drive, profile_id=profile_id)
    mark = branding.get("bytes") if isinstance(branding, dict) else None
    if not isinstance(mark, bytes) or not mark:
        deny("native_gallery_branding_bytes_missing")
    selected = set(selected_slide_ids)
    changed = set()
    used = set()
    expected_ratio = current["aspect_ratio"]
    a, b = map(int, expected_ratio.split(":"))
    for i, (old, new) in enumerate(zip(source, revision_artifacts), start=1):
        if not isinstance(new, dict):
            deny("native_gallery_revised_artifact_missing")
        if (new.get("slot_id") != old["slot_id"] or
                new.get("order") != i or
                new.get("output_id") != output_id or
                new.get("profile_id") != profile_id or
                new.get("content_item_id") != content_item_id or
                not FILE.fullmatch(str(new.get("drive_file_id") or "")) or
                new["drive_file_id"] in used):
            deny("native_gallery_revised_identity_changed")
        used.add(new["drive_file_id"])
        if old["slot_id"] not in selected:
            if new != old:
                deny("native_gallery_unselected_source_changed")
            continue
        if new["drive_file_id"] == old["drive_file_id"]:
            deny("native_gallery_selected_source_not_replaced")
        changed.add(old["slot_id"])
        meta = drive.get_file(new["drive_file_id"])
        if (not isinstance(meta, dict) or
                meta.get("id") != new["drive_file_id"] or
                meta.get("trashed") is True or
                staging_folder_id not in (meta.get("parents") or []) or
                meta.get("mimeType") not in MIME):
            deny("native_gallery_revised_private_staging_invalid")
        # A Drive staging location alone does not prove private access.
        # Independently inspect effective permissions on the exact file.
        if not callable(getattr(drive, "list_file_permissions", None)):
            deny("native_gallery_staging_permissions_unavailable")
        permissions = drive.list_file_permissions(new["drive_file_id"])
        if (not isinstance(permissions, list) or not permissions or
                any(not isinstance(p, dict) or p.get("type") in (
                    "anyone", "domain"
                ) or p.get("type") not in ("user", "group")
                    for p in permissions)):
            deny("native_gallery_staging_public_permissions_denied")
        rights_record = matching_owned_media(client, profile_id, new["drive_file_id"])
        if new.get("source_media_asset_id") != rights_record:
            deny("native_gallery_revised_rights_record_changed")
        actual, raw = actual_image(drive, new["drive_file_id"])
        if (new.get("mime_type") != actual["mime_type"] or
                new.get("sha256") != actual["sha256"] or
                new.get("byte_count") != actual["byte_count"] or
                new.get("width") != actual["width"] or
                new.get("height") != actual["height"] or
                new.get("rights_verified") is not True or
                new.get("watermark_verified") is not True or
                abs(actual["width"] / actual["height"] - a/b) > .015 or
                not visible_source_watermark(raw, mark)):
            deny("native_gallery_revised_bytes_or_brand_invalid")
    if changed != selected:
        deny("native_gallery_selected_revisions_incomplete")
    return {"ok": True, "verified": True, "output_id": output_id,
            "profile_id": profile_id, "content_item_id": content_item_id,
            "verified_slides": len(revision_artifacts),
            "replaced_slides": len(changed), "source_sha256": original_manifest_sha256,
            "rights_verified": True, "private_drive_verified": True,
            "watermark_verified": True, "publication_authorized": False}
