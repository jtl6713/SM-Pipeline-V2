"""Private original/revised gallery image bytes for authenticated Studio review.

The Worker must authorize the user and profile first. Runner independently
re-reads the exact held job and Google Drive media and never shares a file.
No source or revised Drive ID appears in a browser URL.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re

from flask import Blueprint, Response, jsonify, request

from rendering_review.gallery_authoritative import read_authoritative_gallery_source
from rendering_review.native_gallery_revised_verify import verify_staged_gallery_revision

JOBS = "tbl5sq9xBrF6bgPph"
OUTPUTS = "tblrlPeboBthkplH0"
ITEMS = "tblwzN9AXWvmKVKPs"
REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
PRIVATE_STATES = {"ready_for_review", "creative_accepted", "rejected"}


def one_link(f, key):
    value = f.get(key)
    return value[0] if isinstance(value, list) and len(value) == 1 else None


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()


def read_private_native_gallery_image(
    *, client, drive, output_id, job_id, slide_id, variant,
    folder, source_loader=read_authoritative_gallery_source,
    verifier=verify_staged_gallery_revision,
):
    if not REC.fullmatch(output_id) or not TOKEN.fullmatch(job_id) or not (
        REC.fullmatch(slide_id)
    ) or variant not in {"original", "revised"}:
        raise ValueError("native_gallery_preview_identity_invalid")
    jobs = client.list_records(
        JOBS, formula='{Job_ID}="' + job_id + '"', max_records=2,
    )
    if not isinstance(jobs, list) or len(jobs) != 1:
        raise ValueError("native_gallery_preview_job_unverified")
    row = jobs[0]
    j = row.get("fields", {})
    if (not REC.fullmatch(str(row.get("id") or "")) or
            j.get("Job_ID") != job_id or
            j.get("Output_Record_ID") != output_id or
            j.get("Job_State") not in PRIVATE_STATES or
            not REC.fullmatch(str(j.get("Profile_Record_ID") or "")) or
            not REC.fullmatch(str(j.get("Content_Item_Record_ID") or "")) or
            not SHA.fullmatch(str(j.get("Original_Manifest_SHA256") or "")) or
            not SHA.fullmatch(str(j.get("Revised_Manifest_SHA256") or ""))):
        raise ValueError("native_gallery_preview_job_state_unverified")
    output = client.get_record(OUTPUTS, output_id)
    f = output.get("fields", {}) if output.get("id") == output_id else {}
    if (one_link(f, "Content_Item") != j["Content_Item_Record_ID"] or
            f.get("Do_Not_Publish") is not True or
            f.get("Studio_Render_Review_Hold_Active") is not True or
            f.get("Studio_Render_Review_Hold_ID") != j.get("Hold_ID") or
            f.get("Studio_Render_Review_Hold_Owner") != j.get("Hold_Owner") or
            f.get("Studio_Render_Review_Session_ID") != j.get("Hold_Owner") or
            any(f.get(x) for x in (
                "Published_At", "Platform_Post_ID", "Platform_Media_ID",
                "Publish_Started_At", "Publish_Locked_At", "Publish_Locked_By",
            ))):
        raise ValueError("native_gallery_preview_hold_changed")
    item = client.get_record(ITEMS, j["Content_Item_Record_ID"])
    if (item.get("id") != j["Content_Item_Record_ID"] or
            one_link(item.get("fields", {}), "Content_Profile") !=
            j["Profile_Record_ID"]):
        raise ValueError("native_gallery_preview_profile_denied")
    try:
        original = json.loads(j["Original_Manifest_JSON"])
        revised = json.loads(j["Revised_Manifest_JSON"])
        plan = json.loads(j["Plan_JSON"])
    except (KeyError, ValueError, TypeError):
        raise ValueError("native_gallery_preview_manifest_missing")
    if (not isinstance(original, list) or not isinstance(revised, list) or
            not 1 <= len(original) <= 20 or len(original) != len(revised) or
            not isinstance(plan, dict) or
            not isinstance(plan.get("selected"), list) or
            plan.get("profile_id") != j["Profile_Record_ID"] or
            plan.get("output_id") != output_id):
        raise ValueError("native_gallery_preview_manifest_invalid")
    source = source_loader(
        client=client, drive=drive, output_id=output_id,
        expected_profile_id=j["Profile_Record_ID"],
    )
    if (source.get("artifacts") != original or
            source.get("original_artifacts_sha256") !=
            j["Original_Manifest_SHA256"] or
            source.get("original_artifact_watermark_verified") is not True):
        raise ValueError("native_gallery_preview_source_changed")
    if (hashlib.sha256(json.dumps(revised, separators=(",", ":")).encode(
        "utf-8"
    )).hexdigest() != j["Revised_Manifest_SHA256"]):
        raise ValueError("native_gallery_preview_revision_hash_changed")
    selected = [x["slide_id"] for x in plan["selected"]]
    if not verifier(
        client=client, drive=drive, output_id=output_id,
        profile_id=j["Profile_Record_ID"],
        content_item_id=j["Content_Item_Record_ID"],
        original_artifacts=original, revision_artifacts=revised,
        selected_slide_ids=selected, staging_folder_id=folder,
    ):
        raise ValueError("native_gallery_preview_drive_unverified")
    matches = [i for i, artifact in enumerate(original)
               if artifact.get("slot_id") == slide_id]
    if len(matches) != 1:
        raise ValueError("native_gallery_preview_slide_unavailable")
    index = matches[0]
    media = original[index] if variant == "original" else revised[index]
    binary, mime = drive.download_file(media["drive_file_id"])
    if (not isinstance(binary, bytes) or mime != media.get("mime_type") or
            len(binary) != media.get("byte_count") or
            hashlib.sha256(binary).hexdigest() != media.get("sha256")):
        raise ValueError("native_gallery_preview_bytes_changed")
    return binary, mime


def create_native_gallery_preview_blueprint(
    settings, *, client_factory=_client, drive_factory=_drive,
    reader=read_private_native_gallery_image,
):
    bp = Blueprint("native_gallery_private_review_media", __name__)

    @bp.get("/jobs/native-gallery/revision-media/<output_id>/<job_id>/<slide_id>/<variant>")
    def native_gallery_private_media(output_id, job_id, slide_id, variant):
        if os.environ.get("NATIVE_GALLERY_PRIVATE_PREVIEW_ENABLED") != "true":
            return jsonify(ok=False, error="native_gallery_preview_disabled"), 405
        secret = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        presented = request.headers.get("X-Pipeline-Secret", "")
        if len(secret) < 24 or not presented or not hmac.compare_digest(
            secret, presented
        ):
            return jsonify(ok=False, error="native_gallery_preview_auth_denied"), 403
        folder = os.environ.get("NATIVE_GALLERY_STAGING_FOLDER_ID", "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", folder):
            return jsonify(ok=False, error="native_gallery_preview_staging_disabled"), 503
        try:
            media, mime = reader(
                client=client_factory(), drive=drive_factory(),
                output_id=output_id, job_id=job_id, slide_id=slide_id,
                variant=variant, folder=folder,
            )
        except ValueError:
            return jsonify(ok=False, error="native_gallery_preview_not_verified"), 409
        except Exception:
            return jsonify(ok=False, error="native_gallery_preview_source_unavailable"), 503
        if not isinstance(media, bytes) or not 1024 <= len(media) <= 30_000_000 or (
            mime not in ("image/png", "image/jpeg", "image/webp")
        ):
            return jsonify(ok=False, error="native_gallery_preview_invalid_media"), 503
        return Response(media, status=200, headers={
            "Content-Type": mime,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        })
    return bp
