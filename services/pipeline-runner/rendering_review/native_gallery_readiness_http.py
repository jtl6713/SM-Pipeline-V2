"""Authenticated, read-only Stage 1 Runner readiness inspection.

Designed to diagnose WHY private C5/C6 cannot start without creating, claiming,
uploading, enabling, or publishing anything. Only sanitized enums and booleans
leave the Runner; exception messages, folder IDs, OAuth tokens and URLs do not.
"""
from __future__ import annotations

import hmac
import os
import re
from urllib.parse import urlsplit

from flask import Blueprint, jsonify, request
from config import PIPELINE_RUNNER_CODE_VERSION
from rendering_review.native_gallery_staging_settings import (
    NativeGalleryStagingDenied, read_native_gallery_staging_setting,
    verify_native_gallery_staging_permissions,
)
from rendering_review.native_gallery_rights_policy import (
    NativeGalleryRightsPolicyDenied, build_approved_native_gallery_clearance,
)

TOKEN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
OAUTH_KEYS = ("google_client_id", "google_client_secret", "google_refresh_token")
C5_FLAGS = (
    "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED",
    "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED",
    "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED",
)


def _classify_access_failure(error):
    """Classify an HTTP error by host/status, never return its sensitive body."""
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None)
    host = urlsplit(str(getattr(response, "url", "") or "")).hostname or ""
    if host == "oauth2.googleapis.com" and status in (400, 401, 403):
        return "DRIVE_OAUTH_REFRESH_REJECTED"
    if host in ("www.googleapis.com", "www.googleapis.com".replace("www.", "")):
        if status in (401, 403):
            return "DRIVE_RUNNER_ACCOUNT_ACCESS_DENIED"
        if status == 404:
            return "DRIVE_FOLDER_NOT_VISIBLE_TO_RUNNER"
    return "DRIVE_ACCESS_READBACK_UNAVAILABLE"


def inspect_native_gallery_readiness(*, settings, client_factory, drive_factory,
                                     rights_policy_factory=build_approved_native_gallery_clearance):
    """Return data safe for authenticated operational diagnostics only."""
    flags_off = all(os.environ.get(k) != "true" for k in C5_FLAGS)
    auto_off = os.environ.get("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED") != "true"
    blockers = []
    rights = False
    try:
        clearance = rights_policy_factory(settings)
        rights = getattr(clearance, "preferred_account", None) in ("PRIMARY", "SECONDARY")
    except Exception:
        # A missing exact human-reviewed rights certificate is NOT passed.
        pass
    if not rights:
        blockers.append("EXACT_PROVIDER_MODEL_RIGHTS_NOT_APPROVED")

    credentials = all(bool(str(settings.get(k) or "").strip()) for k in OAUTH_KEYS)
    folder_id = None
    airtable_ok = False
    client = None
    try:
        client = client_factory()
        folder_id = read_native_gallery_staging_setting(client)
        airtable_ok = True
    except NativeGalleryStagingDenied as exc:
        reason = str(exc)
        codes = {
            "native_gallery_staging_airtable_unavailable": "STAGING_AIRTABLE_UNAVAILABLE",
            "native_gallery_staging_setting_not_unique": "STAGING_AIRTABLE_NOT_UNIQUE",
            "native_gallery_staging_setting_inactive": "STAGING_AIRTABLE_INACTIVE",
            "native_gallery_staging_folder_invalid": "STAGING_AIRTABLE_ID_INVALID",
            "native_gallery_staging_env_pin_conflict": "STAGING_LOCAL_PIN_CONFLICT",
        }
        blockers.append(codes.get(reason, "STAGING_AIRTABLE_UNVERIFIED"))
    except Exception:
        blockers.append("STAGING_AIRTABLE_UNAVAILABLE")

    drive_ok = False
    if not credentials:
        blockers.append("RUNNER_GOOGLE_OAUTH_CREDENTIALS_MISSING")
    elif airtable_ok:
        try:
            drive = drive_factory()
            verify_native_gallery_staging_permissions(drive, folder_id)
            drive_ok = True
        except NativeGalleryStagingDenied as exc:
            if str(exc) == "native_gallery_staging_not_owner_only":
                blockers.append("DRIVE_OWNER_ONLY_PERMISSIONS_UNVERIFIED")
            else:
                blockers.append(_classify_access_failure(exc.__cause__))
        except Exception:
            blockers.append("DRIVE_ACCESS_READBACK_UNAVAILABLE")

    origin = str(os.environ.get("NATIVE_GALLERY_WORKER_BASE_URL", "")).strip()
    parsed = urlsplit(origin)
    origin_ok = (parsed.scheme == "https" and bool(parsed.hostname)
                 and parsed.username is None and parsed.password is None
                 and not parsed.fragment)
    if not origin_ok:
        blockers.append("WORKER_ORIGIN_NOT_CONFIGURED")
    secret_ok = len(str(os.environ.get("NATIVE_GALLERY_JOB_SHARED_SECRET", ""))) >= 24
    if not secret_ok:
        blockers.append("JOB_SHARED_SECRET_NOT_CONFIGURED")
    consumer_ok = bool(TOKEN.fullmatch(
        str(os.environ.get("NATIVE_GALLERY_RUNNER_CONSUMER_ID", ""))))
    if not consumer_ok:
        blockers.append("CONSUMER_ID_NOT_CONFIGURED")
    if not auto_off:
        blockers.append("AUTO_EXECUTION_MUST_REMAIN_OFF")
    if not flags_off:
        blockers.append("ONE_SHOT_EXECUTION_FLAGS_REQUIRE_REVIEW")
    return {
        "ok": True, "mode": "read_only_no_generation",
        "runner_version": PIPELINE_RUNNER_CODE_VERSION,
        "provider_model_policy_matches_config": rights,
        "staging_airtable_setting_verified": airtable_ok,
        "runner_google_oauth_configured": credentials,
        "runner_can_access_private_staging": drive_ok,
        "worker_origin_configured": origin_ok,
        "job_shared_secret_configured": secret_ok,
        "consumer_id_configured": consumer_ok,
        "auto_execution_disabled": auto_off,
        "one_shot_execution_disabled": flags_off,
        "canary_prerequisites_verified": not blockers,
        "blockers": blockers,
        "can_generate": False, "can_publish": False,
        "source_note": "Private readback only; no job claimed and no provider rights inferred.",
    }


def create_native_gallery_readiness_blueprint(
    settings, *, client_factory=None, drive_factory=None,
    inspector=inspect_native_gallery_readiness,
):
    bp = Blueprint("native_gallery_readiness", __name__)

    @bp.get("/jobs/native-gallery/readiness")
    def readiness():
        secret = str(settings.get("pipeline_runner_shared_secret") or "").strip()
        actual = request.headers.get("X-Pipeline-Secret", "")
        if len(secret) < 24 or not actual or not hmac.compare_digest(secret, actual):
            response = jsonify(ok=False, error="native_gallery_readiness_auth_denied")
            response.headers["Cache-Control"] = "no-store"
            return response, 403
        if request.query_string:
            return jsonify(ok=False, error="native_gallery_readiness_parameters_forbidden"), 400
        try:
            if client_factory is None:
                from airtable.client import AirtableClient
                cf = AirtableClient
            else:
                cf = client_factory
            if drive_factory is None:
                from integrations.google_drive import GoogleDriveClient
                df = GoogleDriveClient
            else:
                df = drive_factory
            report = inspector(settings=settings, client_factory=cf,
                               drive_factory=df)
        except Exception:
            report = {"ok": False, "mode": "read_only_no_generation",
                      "blockers": ["RUNNER_READINESS_INSPECTION_UNAVAILABLE"],
                      "can_generate": False, "can_publish": False}
        response = jsonify(report)
        response.headers["Cache-Control"] = "no-store"
        return response, 200 if report.get("ok") is True else 503

    return bp
