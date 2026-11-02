"""Protected read-only verification of a staged native gallery V2 manifest.

Only the Worker may request this service; it must already own the exact held
job. The Runner independently inspects Airtable provenance, authenticated
Drive media bytes, watermark pixels, staging folder and file permissions.
No uploads, edits, creative approval, public links or publishing.
"""
from __future__ import annotations

import hmac
import json
import os
import re

from flask import Blueprint, jsonify, request

from rendering_review.native_gallery_revision_verify import (
    NativeGalleryRevisionVerifyDenied, verify_native_gallery_revision,
)

RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")
ALLOWED = frozenset(("output_id", "profile_id", "content_item_id", "job_id",
                     "original_manifest_sha256", "original_artifacts",
                     "revision_artifacts", "selected_slide_ids"))


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()


def create_native_gallery_revision_verify_blueprint(
    settings, *, client_factory=_client, drive_factory=_drive,
    verifier=verify_native_gallery_revision
):
    bp = Blueprint("native_gallery_revision_verify", __name__)

    @bp.post("/jobs/native-gallery/verify-revision")
    def verify_revision():
        if os.environ.get("NATIVE_GALLERY_REVISION_VERIFY_ENABLED") != "true":
            return jsonify(ok=False, error="native_gallery_revision_verifier_disabled"), 405
        expected = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        supplied = request.headers.get("X-Pipeline-Secret", "")
        if len(expected) < 24 or not supplied or not hmac.compare_digest(expected, supplied):
            return jsonify(ok=False, error="native_gallery_revision_auth_denied"), 403
        if not request.is_json:
            return jsonify(ok=False, error="native_gallery_revision_json_required"), 415
        raw = request.get_data(cache=False)
        if len(raw) > 85000:
            return jsonify(ok=False, error="native_gallery_revision_body_too_large"), 413
        try:
            body = json.loads(raw)
        except (TypeError, ValueError, UnicodeError):
            return jsonify(ok=False, error="native_gallery_revision_invalid_json"), 400
        if (not isinstance(body, dict) or set(body) != ALLOWED or
                not all(RECORD.fullmatch(str(body.get(key) or ""))
                        for key in ("output_id", "profile_id", "content_item_id")) or
                not TOKEN.fullmatch(str(body.get("job_id") or "")) or
                not SHA.fullmatch(str(body.get("original_manifest_sha256") or "")) or
                not isinstance(body.get("original_artifacts"), list) or
                not isinstance(body.get("revision_artifacts"), list) or
                not isinstance(body.get("selected_slide_ids"), list)):
            return jsonify(ok=False, error="native_gallery_revision_invalid_claim"), 400
        folder = os.environ.get("NATIVE_GALLERY_STAGING_FOLDER_ID", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{20,}", folder):
            return jsonify(ok=False, error="native_gallery_private_folder_unconfigured"), 503
        try:
            result = verifier(
                client=client_factory(), drive=drive_factory(),
                output_id=body["output_id"], profile_id=body["profile_id"],
                content_item_id=body["content_item_id"],
                staging_folder_id=folder,
                original_manifest_sha256=body["original_manifest_sha256"],
                original_artifacts=body["original_artifacts"],
                revision_artifacts=body["revision_artifacts"],
                selected_slide_ids=body["selected_slide_ids"],
            )
        except NativeGalleryRevisionVerifyDenied:
            return jsonify(ok=False, error="native_gallery_revision_not_verified"), 409
        except Exception:
            return jsonify(ok=False, error="native_gallery_revision_evidence_unavailable"), 503
        if (not isinstance(result, dict) or result.get("ok") is not True or
                result.get("verified") is not True or
                result.get("output_id") != body["output_id"] or
                result.get("profile_id") != body["profile_id"] or
                result.get("content_item_id") != body["content_item_id"] or
                result.get("private_drive_verified") is not True or
                result.get("rights_verified") is not True or
                result.get("watermark_verified") is not True or
                result.get("publication_authorized") is not False):
            return jsonify(ok=False, error="native_gallery_revision_receipt_invalid"), 503
        response = jsonify({
            "ok": True, "verified": True,
            "output_id": body["output_id"], "job_id": body["job_id"],
            "profile_id": body["profile_id"],
            "private_drive_verified": True, "rights_verified": True,
            "watermark_verified": True, "publication_authorized": False,
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return bp
