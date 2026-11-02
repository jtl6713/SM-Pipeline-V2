"""Private on-demand native gallery outbox claim. No autonomous image work.

A single authenticated request scans at most three canonical Airtable jobs
and makes at most one protected Worker POST to claim a job. No render, upload
or publication. OFF by default until full source/hold gates are certified.
"""
from __future__ import annotations

import hmac
import os

from flask import Blueprint, jsonify, request

from rendering_review.native_gallery_claim_client import (
    NativeGalleryClaimDenied, claim_one_native_gallery_job,
)


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def create_native_gallery_claim_blueprint(settings, *, client_factory=_client,
                                           claim=claim_one_native_gallery_job):
    bp = Blueprint("native_gallery_claim", __name__)

    @bp.post("/jobs/native-gallery/claim-next")
    def native_gallery_claim_next():
        if os.environ.get("NATIVE_GALLERY_RUNNER_CLAIM_ENABLED") != "true":
            return jsonify(ok=False, error="native_gallery_runner_claim_disabled"), 405
        expected = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        actual = request.headers.get("X-Pipeline-Secret", "")
        if len(expected) < 24 or not actual or not hmac.compare_digest(expected, actual):
            return jsonify(ok=False, error="native_gallery_runner_auth_denied"), 403
        if request.content_length is not None and request.content_length > 0:
            return jsonify(ok=False, error="native_gallery_claim_body_not_allowed"), 400
        # No request parameters may select a job, profile, Drive file or URL.
        worker_base = os.environ.get("NATIVE_GALLERY_WORKER_BASE_URL", "")
        shared = os.environ.get("NATIVE_GALLERY_JOB_SHARED_SECRET", "")
        consumer = os.environ.get("NATIVE_GALLERY_RUNNER_CONSUMER_ID", "")
        try:
            result = claim(client=client_factory(), worker_base=worker_base,
                           shared_secret=shared, consumer_identity=consumer)
        except NativeGalleryClaimDenied:
            return jsonify(ok=False,
                           error="native_gallery_claim_requires_reconciliation"), 409
        except Exception:
            return jsonify(ok=False, error="native_gallery_claim_unavailable"), 503
        if (not isinstance(result, dict) or result.get("ok") is not True or
                result.get("render_started") is not False or
                result.get("publication_authorized") is not False):
            return jsonify(ok=False, error="native_gallery_claim_receipt_invalid"), 503
        response = jsonify(result)
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return bp
