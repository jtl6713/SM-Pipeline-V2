"""Protected, default-OFF Runner endpoint for a single non-Vibe C5/C6 job.

No browser parameters select an output or Drive destination. Only a server
operator can enable execution after rights policy verification. Never retries
ambiguous generation; does not approve, schedule or publish.
"""
from __future__ import annotations

import hmac
import os

from flask import Blueprint, jsonify, request

from rendering_review.native_gallery_c5c6_executor import (
    NativeGalleryExecutionDenied, execute_one_native_gallery,
)
from rendering_review.native_gallery_rights_policy import (
    NativeGalleryRightsPolicyDenied, build_approved_native_gallery_clearance,
)


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def _drive():
    from integrations.google_drive import GoogleDriveClient
    return GoogleDriveClient()


def create_native_gallery_execute_blueprint(
    settings, *, client_factory=_client, drive_factory=_drive,
    executor=execute_one_native_gallery,
    rights_policy_factory=build_approved_native_gallery_clearance,
):
    bp = Blueprint("native_gallery_c5c6_executor", __name__)

    @bp.post("/jobs/native-gallery/execute-next")
    def execute_next():
        if os.environ.get("NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED") != "true":
            return jsonify(ok=False, error="native_gallery_executor_disabled"), 405
        expected = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        actual = request.headers.get("X-Pipeline-Secret", "")
        if len(expected) < 24 or not actual or not hmac.compare_digest(expected, actual):
            return jsonify(ok=False, error="native_gallery_executor_auth_denied"), 403
        # A caller never chooses the output, model, profile or media: no body
        # and no query strings, even from a nominally authenticated service.
        if request.query_string or request.stream.read(1):
            return jsonify(ok=False, error="native_gallery_executor_input_forbidden"), 400
        folder = os.environ.get("NATIVE_GALLERY_STAGING_FOLDER_ID", "")
        try:
            # Reject bad licensing configuration BEFORE claiming a job.
            rights = rights_policy_factory(settings)
            result = executor(
                client=client_factory(), drive=drive_factory(),
                worker_base=os.environ.get("NATIVE_GALLERY_WORKER_BASE_URL", ""),
                shared_secret=os.environ.get("NATIVE_GALLERY_JOB_SHARED_SECRET", ""),
                consumer_identity=os.environ.get("NATIVE_GALLERY_RUNNER_CONSUMER_ID", ""),
                staging_folder_id=folder, rights_clearance=rights,
            )
        except NativeGalleryRightsPolicyDenied:
            return jsonify(ok=False, error="native_gallery_rights_policy_not_approved"), 503
        except NativeGalleryExecutionDenied:
            # A denied or ambiguous reserved attempt is operator-only
            # reconciliation: never auto-requeue or auto-launch.
            return jsonify(ok=False, error="native_gallery_execution_requires_reconciliation"), 409
        except Exception:
            return jsonify(ok=False, error="native_gallery_execution_unavailable"), 503
        if result.get("ok") is not True or result.get("publication_authorized") is not False:
            return jsonify(ok=False, error="native_gallery_execution_receipt_invalid"), 503
        response = jsonify(result)
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return bp
