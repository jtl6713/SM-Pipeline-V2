"""Private, default-disabled model-backed Chicago Rendering Review proposal route.

A proposal cannot create/commit a plan, approve, render, release a hold, or
publish. Evidence comes exclusively from authoritative Airtable, not caller
supplied prompt context. The Studio Worker must separately authenticate the
administrator and persist any accepted response under a session version fence.
"""
from __future__ import annotations

import hmac
import os
import re

from flask import Blueprint, jsonify, request

from rendering_review.evidence import load_evidence
from rendering_review.producer import propose_revision, canonical_hash, ProducerModelHTTPError

_RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
_SESSION = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
_FIELDS = frozenset(("output_id", "session_id", "expected_version", "direction"))


def _client():
    from airtable.client import AirtableClient
    return AirtableClient()


def create_rendering_review_producer_blueprint(settings, *,
                                               client_factory=_client,
                                               evidence_loader=load_evidence,
                                               producer=propose_revision):
    """Install only the restricted proposal endpoint; no mutation operations."""
    blueprint = Blueprint("rendering_review_proposals", __name__)

    @blueprint.post("/jobs/rendering-review/propose")
    def rendering_review_propose():
        # This flag is never supplied by the request and is OFF by default.
        if os.environ.get("RENDERING_REVIEW_PRODUCER_PROPOSALS_ENABLED") != "true":
            return jsonify({"ok": False, "error": "producer_proposal_disabled"}), 405
        expected_secret = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        if not expected_secret:
            return jsonify({"ok": False, "error": "producer_auth_unconfigured"}), 503
        received = request.headers.get("X-Pipeline-Secret", "")
        if not received or not hmac.compare_digest(received, expected_secret):
            return jsonify({"ok": False, "error": "producer_unauthorized"}), 401
        if not request.is_json or request.content_length is not None and request.content_length > 5000:
            return jsonify({"ok": False, "error": "invalid_producer_request"}), 400
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or set(body) != _FIELDS:
            return jsonify({"ok": False, "error": "invalid_producer_request"}), 400

        output_id = body["output_id"]
        session_id = body["session_id"]
        version = body["expected_version"]
        direction = body["direction"]
        if (not isinstance(output_id, str) or not _RECORD.fullmatch(output_id)
                or not isinstance(session_id, str) or not _SESSION.fullmatch(session_id)
                or type(version) is not int or version < 1
                or not isinstance(direction, str)
                or not direction.strip() or len(direction) > 3000):
            return jsonify({"ok": False, "error": "invalid_producer_request"}), 400

        # No prompt/evidence supplied by the caller can replace this read.
        # A stale session, missing review hold, wrong city or remote dispatch
        # is denied by load_evidence before any model invocation.
        try:
            evidence = evidence_loader(client_factory(), output_id, session_id, version)
        except ValueError:
            return jsonify({"ok": False, "error": "stale_or_unavailable_review_evidence"}), 409
        except Exception:
            return jsonify({"ok": False, "error": "review_evidence_unavailable"}), 503

        # Freeze the exact evidence the model is about to see. A session may
        # change while the model is reasoning; never return a stale candidate.
        evidence_fingerprint = canonical_hash(evidence)
        try:
            result = producer(evidence, direction, settings)
        except ValueError:
            return jsonify({"ok": False, "error": "producer_proposal_invalid"}), 422
        except ProducerModelHTTPError as error:
            # A bounded provider status is useful for protected diagnostics.
            # Never forward upstream error bodies, credentials, or prompts.
            return jsonify({"ok": False, "error": "producer_model_http_" + str(error.status_code)}), 502
        except Exception:
            return jsonify({"ok": False, "error": "producer_model_unavailable"}), 502
        # Re-read authority AFTER the model call. If a reviewer edited the
        # conversation, the publishing owner claimed the output, or the
        # review hold disappeared, discard the candidate. This is read-only.
        try:
            current = evidence_loader(client_factory(), output_id, session_id, version)
        except ValueError:
            return jsonify({"ok": False, "error": "review_changed_during_proposal"}), 409
        except Exception:
            return jsonify({"ok": False, "error": "review_evidence_unavailable"}), 503
        if canonical_hash(current) != evidence_fingerprint:
            return jsonify({"ok": False, "error": "review_changed_during_proposal"}), 409

        if not (isinstance(result, dict) and result.get("candidate_only") is True
                and result.get("requires_fact_validation") is True
                and result.get("visual_inspection_performed") is False):
            return jsonify({"ok": False, "error": "producer_proposal_untrusted"}), 502

        response = jsonify({
            "ok": True,
            "output_id": output_id,
            "session_id": session_id,
            "expected_version": version,
            "proposal": result,
            "authorization": "none",
            "render_queued": False,
            "publication_changed": False,
        })
        response.headers["Cache-Control"] = "no-store"
        return response, 200

    return blueprint
