"""Service-only readback of privately staged native-gallery revision images.

The authenticated Studio Worker has already checked its durable held job and
lease. Runner reloads source authority and private Drive bytes independently.
This endpoint never renders, shares files, writes Airtable or publishes.
"""
from __future__ import annotations

import hmac
import json
import os
import re

from flask import Blueprint, jsonify, request
from rendering_review.native_gallery_revised_verify import (
    RevisedGalleryDenied, verify_staged_gallery_revision,
)

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
FILE = re.compile(r"[A-Za-z0-9_-]{20,}\Z")


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()


def create_native_gallery_revised_blueprint(
    settings, *, client_factory=_client, drive_factory=_drive,
    verifier=verify_staged_gallery_revision,
):
    bp = Blueprint("native_gallery_revision_verification", __name__)

    @bp.post("/jobs/native-gallery/verify-revision")
    def verify_revision():
        if os.environ.get("NATIVE_GALLERY_REVISED_VERIFY_ENABLED") != "true":
            return jsonify(ok=False, error="gallery_revision_verification_disabled"), 405
        secret = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        supplied = request.headers.get("X-Pipeline-Secret", "")
        if len(secret) < 24 or not supplied or not hmac.compare_digest(secret, supplied):
            return jsonify(ok=False, error="gallery_revision_service_auth_required"), 403
        if not request.is_json:
            return jsonify(ok=False, error="gallery_revision_json_required"), 415
        raw = request.get_data(cache=False)
        if len(raw) > 40000:
            return jsonify(ok=False, error="gallery_revision_payload_oversized"), 413
        try:
            body = json.loads(raw)
        except (TypeError, ValueError, UnicodeError):
            return jsonify(ok=False, error="gallery_revision_json_invalid"), 400
        if not isinstance(body, dict) or set(body) != {
            "output_id", "profile_id", "content_item_id",
            "original_artifacts", "revision_artifacts", "selected_slide_ids",
        } or any(not REC.fullmatch(str(body[k] or "")) for k in (
            "output_id", "profile_id", "content_item_id",
        )) or not isinstance(body["revision_artifacts"], list) or (
            len(body["revision_artifacts"]) > 20
        ):
            return jsonify(ok=False, error="gallery_revision_request_invalid"), 400
        folder = os.environ.get("NATIVE_GALLERY_STAGING_FOLDER_ID", "").strip()
        if not FILE.fullmatch(folder):
            return jsonify(ok=False, error="gallery_revision_private_folder_unavailable"), 503
        try:
            verified = verifier(
                client=client_factory(), drive=drive_factory(),
                output_id=body["output_id"], profile_id=body["profile_id"],
                content_item_id=body["content_item_id"],
                original_artifacts=body["original_artifacts"],
                revision_artifacts=body["revision_artifacts"],
                selected_slide_ids=body["selected_slide_ids"],
                staging_folder_id=folder,
            )
        except RevisedGalleryDenied:
            return jsonify(ok=False, error="gallery_revision_drive_or_rights_denied"), 409
        except Exception:
            return jsonify(ok=False, error="gallery_revision_readback_unavailable"), 503
        if verified is not True:
            return jsonify(ok=False, error="gallery_revision_not_verified"), 503
        response = jsonify(ok=True, verified=True,
                           publication_authorized=False,
                           factory_approved=False, creative_approved=False)
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return bp
