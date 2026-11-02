"""Protected service-only native gallery source-byte preflight.

No Studio browser direct access. Explicitly read-only; does not persist an
attempt, render images, modify originals or authorize publishing.
"""
from __future__ import annotations

import hmac
import os
import re

from flask import Blueprint, jsonify, request

from rendering_review.gallery_authoritative import (
    GalleryPreflightDenied, read_authoritative_gallery_source,
)

_REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()


def create_native_gallery_preflight_blueprint(
    settings, *, client_factory=_client, drive_factory=_drive,
    verifier=read_authoritative_gallery_source,
):
    bp = Blueprint("native_gallery_source_preflight", __name__)

    @bp.post("/jobs/native-gallery/source-preflight")
    def native_gallery_source_preflight():
        if os.environ.get("NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED") != "true":
            return jsonify(ok=False, error="native_gallery_preflight_disabled"), 405
        secret = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        provided = request.headers.get("X-Pipeline-Secret", "")
        if not secret or not provided or not hmac.compare_digest(provided, secret):
            return jsonify(ok=False, error="native_gallery_auth_denied"), 403
        if not request.is_json or (
            request.content_length is not None and request.content_length > 500
        ):
            return jsonify(ok=False, error="native_gallery_request_invalid"), 400
        # Content-Length is optional on chunked service calls. Always bound
        # the actual received body before parsing JSON.
        raw = request.get_data(cache=False)
        if len(raw) > 500:
            return jsonify(ok=False, error="native_gallery_request_invalid"), 400
        try:
            import json
            body = json.loads(raw)
        except (TypeError, ValueError, UnicodeDecodeError):
            return jsonify(ok=False, error="native_gallery_request_invalid"), 400
        if (not isinstance(body, dict) or set(body) !=
                {"output_id", "expected_profile_id"} or
                not _REC.fullmatch(str(body["output_id"] or "")) or
                not _REC.fullmatch(str(body["expected_profile_id"] or ""))):
            return jsonify(ok=False, error="native_gallery_request_invalid"), 400
        try:
            result = verifier(
                client=client_factory(), drive=drive_factory(),
                output_id=body["output_id"],
                expected_profile_id=body["expected_profile_id"],
            )
        except GalleryPreflightDenied as error:
            # The exception is a stable owned-source blocker; never reveal
            # private source IDs, Drive URLs or credentials.
            return jsonify(ok=False, error=str(error)[:96],
                           can_generate=False, publication_authorized=False), 409
        except Exception:
            return jsonify(ok=False, error="native_gallery_source_unavailable",
                           can_generate=False, publication_authorized=False), 503
        if (result.get("ok") is not True or
                result.get("profile_id") != body["expected_profile_id"] or
                result.get("output_id") != body["output_id"] or
                result.get("can_generate") is not False or
                result.get("publication_authorized") is not False or
                type(result.get("original_artifact_watermark_verified")) is not bool):
            return jsonify(ok=False, error="native_gallery_preflight_unverified"), 503
        # Do not disclose private original Drive IDs or Media Asset records
        # through a service response; a later trusted Runner job will reload.
        response = jsonify({
            "ok": True, "output_id": body["output_id"],
            "profile_id": result["profile_id"],
            "content_item_id": result["content_item_id"],
            "slide_count": result["slide_count"],
            "aspect_ratio": result["aspect_ratio"],
            "sources_byte_verified": result["sources_byte_verified"],
            "source_rights_verified": result["source_rights_verified"],
            "shared_watermark_asset_verified": result["shared_watermark_asset_verified"],
            "original_artifact_watermark_verified": result["original_artifact_watermark_verified"],
            "original_artifacts_sha256": result["original_artifacts_sha256"],
            "can_generate": False, "can_approve": False,
            "publication_authorized": False,
            "blockers": result["blockers"],
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return bp
