"""Isolated image/gallery Rendering Review V2 builder (never mutates V1).

This adapter is *not* a scheduler, Airtable Carousel C5/C6 mutation, approval,
or publisher. Its writer dependencies MUST be backed by a durable exact-attempt
launch ledger before activation. A partially completed launch cannot rerun and
must be reconciled with the committed ledger; no automatic image regeneration.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Callable

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
DRIVE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
DIMENSIONS = {"4:5": (4, 5), "1:1": (1, 1), "9:16": (9, 16), "16:9": (16, 9)}
MIME = {"image/png", "image/jpeg", "image/webp"}
SCHEMA = "studio.render-review.gallery.1"


class GalleryRevisionDenied(ValueError):
    pass


def deny(message: str):
    raise GalleryRevisionDenied(message)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def check_ratio(width: int, height: int, ratio: str) -> bool:
    a, b = DIMENSIONS[ratio]
    return abs(width / height - a / b) <= 0.015


def _source(job: dict, original: dict, plan: dict, authorized_profiles: list) -> list:
    if not isinstance(job, dict) or not isinstance(original, dict) or not isinstance(plan, dict):
        deny("gallery_context_missing")
    profile = job.get("profile_id")
    output = job.get("output_id")
    content = job.get("content_item_id")
    if (not REC.fullmatch(str(output or "")) or
        not REC.fullmatch(str(profile or "")) or
        not REC.fullmatch(str(content or "")) or profile not in authorized_profiles or
        not TOKEN.fullmatch(str(job.get("attempt_id") or "")) or
        not TOKEN.fullmatch(str(job.get("job_id") or "")) or
        not SHA.fullmatch(str(job.get("plan_hash") or "")) or
        job.get("state") != "claimed" or job.get("lease_verified") is not True or
        type(job.get("lease_fence")) is not int or job["lease_fence"] < 1 or
        not TOKEN.fullmatch(str(job.get("session_id") or "")) or
        plan.get("output_id") != output or plan.get("profile_id") != profile or
        plan.get("session_id") != job["session_id"] or
        plan.get("plan_hash") != job["plan_hash"] or
        plan.get("allow_public_publish") is not False or
        plan.get("allow_platform_upload") is not False or
        plan.get("auto_approve") is not False or
        plan.get("mutate_original_production_request") is not False or
        plan.get("mutate_sibling_outputs") is not False or
        plan.get("human_intent") != "explicit_button"):
        deny("gallery_job_not_authorized")
    ratio = plan.get("aspect_ratio")
    if ratio not in DIMENSIONS or ratio != original.get("aspect_ratio"):
        deny("gallery_aspect_identity_changed")
    if (original.get("schema") != SCHEMA or original.get("source_kind") != "original" or
        original.get("authority") != "server" or original.get("verified") is not True or
        original.get("output_id") != output or original.get("profile_id") != profile or
        original.get("content_item_id") != content or
        not SHA.fullmatch(str(original.get("manifest_sha256") or "")) or
        plan.get("original_manifest_sha256") != original["manifest_sha256"]):
        deny("gallery_original_manifest_changed")
    images = original.get("artifacts")
    if not isinstance(images, list) or not (1 <= len(images) <= 80):
        deny("gallery_original_assets_missing")
    seen = set()
    for n, row in enumerate(images, 1):
        if not isinstance(row, dict) or row.get("order") != n or row.get("slot_id") in seen or (
            not TOKEN.fullmatch(str(row.get("slot_id") or "")) or
            not DRIVE.fullmatch(str(row.get("drive_file_id") or "")) or
            row.get("authority") != "server" or row.get("verified") is not True or
            row.get("google_drive_verified") is not True or
            row.get("watermark_verified") is not True or
            row.get("rights_verified") is not True or
            row.get("canonical_media_authority") != "google_drive" or
            row.get("output_id") != output or row.get("profile_id") != profile or
            row.get("content_item_id") != content or
            row.get("mime_type") not in MIME or
            not SHA.fullmatch(str(row.get("sha256") or "")) or
            type(row.get("byte_count")) is not int or row["byte_count"] < 1024 or
            type(row.get("width")) is not int or type(row.get("height")) is not int or
            not 128 <= row["width"] <= 12000 or not 128 <= row["height"] <= 12000 or
            not check_ratio(row["width"], row["height"], ratio)
        ):
            deny("gallery_original_asset_unverified")
        seen.add(row["slot_id"])
    replacements = plan.get("replacements")
    if not isinstance(replacements, list) or not (1 <= len(replacements) <= len(images)):
        deny("gallery_no_bounded_changes")
    by_slot = {row["slot_id"]: row for row in images}
    requested = set()
    for entry in replacements:
        if (not isinstance(entry, dict) or entry.get("slot_id") not in by_slot or
            entry["slot_id"] in requested or
            not isinstance(entry.get("prompt"), str) or
            not 8 <= len(entry["prompt"].strip()) <= 3000 or
            any(k not in {"slot_id", "prompt"} for k in entry)):
            deny("gallery_replacement_not_scoped")
        requested.add(entry["slot_id"])
    return images


def build_isolated_gallery_attempt(
    *, job: dict, original: dict, plan: dict,
    authorized_profiles: list, operations: Any,
) -> dict:
    """Build V2 only after an authoritative single-claim job and V1 hold.

    Trusted operations:
      verify_hold(output_id, session_id) -> bool
      verify_original_sources(original) -> bool (independent Drive bytes + identity/rights)\n      reserve_attempt(job, original_hash, changes_hash) -> bool (atomic once)
      generate_image(prompt, ratio) -> PNG bytes
      watermark_image(image_bytes, profile_id) -> PNG bytes
      upload_image(name, bytes) -> {id} (Drive staging folder, never original)
      verify_drive_image(file_id, sha256, byte_count) -> {
        mime_type, width, height, sha256, byte_count, google_drive_verified }
      verify_generated_rights(output_id, slot_id, file_id, prompt, sha256) -> {verified,media_asset_record_id}
      commit_manifest(job, manifest) -> bool (durable CAS)
      read_manifest(job) -> manifest (readback)
    """
    needed = ("verify_hold", "verify_original_sources", "reserve_attempt", "generate_image",
              "watermark_image", "upload_image", "verify_drive_image",
              "verify_generated_rights", "commit_manifest", "read_manifest")
    if not all(callable(getattr(operations, n, None)) for n in needed):
        deny("gallery_trusted_operations_missing")
    originals = _source(job, original, plan, authorized_profiles)
    output = job["output_id"]
    profile = job["profile_id"]
    new_by_slot = {x["slot_id"]: x for x in plan["replacements"]}
    if operations.verify_hold(output, job["session_id"]) is not True:
        deny("gallery_publication_hold_lost")
    # Metadata-only manifests cannot authorize generation.
    # The trusted operations bridge must independently inspect original Drive bytes.
    if operations.verify_original_sources(original) is not True:
        deny("gallery_original_drive_bytes_unverified")
    canonical = json.dumps(
        [job["output_id"], job["attempt_id"], job["plan_hash"],
         original["manifest_sha256"], plan["replacements"]],
        sort_keys=True, separators=(",", ":"),
    ).encode()
    # A duplicate/ambiguous launch never invokes a second generative call.
    if operations.reserve_attempt(job, original["manifest_sha256"], sha(canonical)) is not True:
        deny("gallery_launch_already_claimed_reconciliation_required")
    results = []
    for old in originals:
        change = new_by_slot.get(old["slot_id"])
        if change is None:
            results.append(dict(old))
            continue
        if operations.verify_hold(output, job["session_id"]) is not True:
            deny("gallery_publication_hold_lost")
        raw = operations.generate_image(change["prompt"], plan["aspect_ratio"])
        if not isinstance(raw, bytes) or len(raw) < 1024:
            deny("gallery_generated_image_invalid")
        branded = operations.watermark_image(raw, profile)
        if not isinstance(branded, bytes) or len(branded) < 1024:
            deny("gallery_profile_watermark_unverified")
        name = "review-%s-%s-%02d.png" % (output, job["attempt_id"], old["order"])
        uploaded = operations.upload_image(name, branded)
        drive_id = uploaded.get("id") if isinstance(uploaded, dict) else None
        if not DRIVE.fullmatch(str(drive_id or "")) or drive_id == old["drive_file_id"]:
            deny("gallery_revision_drive_upload_unverified")
        verified = operations.verify_drive_image(drive_id, sha(branded), len(branded))
        if (not isinstance(verified, dict) or
            verified.get("google_drive_verified") is not True or
            verified.get("sha256") != sha(branded) or
            verified.get("byte_count") != len(branded) or
            verified.get("mime_type") != "image/png" or
            type(verified.get("width")) is not int or
            type(verified.get("height")) is not int or
            not 128 <= verified["width"] <= 12000 or
            not 128 <= verified["height"] <= 12000 or
            not check_ratio(verified["width"], verified["height"], plan["aspect_ratio"])):
            deny("gallery_revision_drive_readback_unverified")
        # An image-generation response alone is not a rights receipt.
        # Promotion requires an independent trusted clearance decision.
        rights = operations.verify_generated_rights(
            output, old["slot_id"], drive_id, change["prompt"], sha(branded)
        )
        # A boolean "yes" cannot identify the new *owned* Media Asset row.
        # The independent Runner V2 verifier later reloads this exact record.
        new_media_id = rights.get("media_asset_record_id") if isinstance(rights, dict) else None
        if (not isinstance(rights, dict) or rights.get("verified") is not True or
                not REC.fullmatch(str(new_media_id or "")) or
                new_media_id == old.get("source_media_asset_id")):
            deny("gallery_generated_image_rights_unverified")
        results.append({**old, "drive_file_id": drive_id, "mime_type": "image/png",
          "width": verified["width"], "height": verified["height"],
          "byte_count": len(branded), "sha256": sha(branded),
          "revision_media_asset_id": new_media_id,
          "watermark_verified": True, "google_drive_verified": True,
          "rights_verified": True})
    if operations.verify_hold(output, job["session_id"]) is not True:
        deny("gallery_publication_hold_lost")
    raw_manifest = json.dumps(results, sort_keys=True, separators=(",", ":")).encode()
    manifest = {
      "schema": SCHEMA, "media_kind": "image-set", "source_kind": "revision",
      "authority": "server", "verified": True, "output_id": output,
      "profile_id": profile, "aspect_ratio": plan["aspect_ratio"],
      "original_manifest_sha256": original["manifest_sha256"],
      "manifest_sha256": sha(raw_manifest), "artifacts": results,
      "source_attempt_id": plan.get("source_attempt_id"),
      "attempt_id": job["attempt_id"], "job_id": job["job_id"],
      "publish_approved": False, "factory_approved": False,
    }
    if operations.commit_manifest(job, manifest) is not True:
        deny("gallery_manifest_commit_unverified")
    saved = operations.read_manifest(job)
    if saved != manifest:
        deny("gallery_manifest_readback_mismatch")
    return {"ok": True, "state": "ready_for_review",
            "output_id": output, "attempt_id": job["attempt_id"],
            "manifest_sha256": manifest["manifest_sha256"],
            "slide_count": len(results), "rendered_count": len(new_by_slot),
            "published": False, "approved": False}
