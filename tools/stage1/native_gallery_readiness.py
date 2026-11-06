"""Stage 1 / C5-C6 read-only Windows Runner readiness inspection.

No Airtable mutations, claims, generation, Google Drive writes, scheduling,
secret disclosure, or provider API requests. Intended to be executed once
through the protected Ops Dashboard shell to inspect the *live* Runner.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from urllib.request import urlopen


CANDIDATE_PATTERN = re.compile(r"[A-Za-z0-9_-]{20,}\Z")
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
REQUIRED_SECRET = "NATIVE_GALLERY_JOB_SHARED_SECRET"
FEATURES = (
    "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED",
    "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED",
    "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED",
    "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED",
    "NATIVE_GALLERY_RIGHTS_REVIEWED",
)


def is_private_folder(metadata, permissions, folder_id):
    """False unless exact folder metadata and all permissions are restrictive."""
    return (
        isinstance(metadata, dict)
        and metadata.get("id") == folder_id
        and metadata.get("mimeType") == "application/vnd.google-apps.folder"
        and metadata.get("trashed") is not True
        and metadata.get("shared") is not True
        and isinstance(permissions, list)
        and len(permissions) == 1
        and isinstance(permissions[0], dict)
        and permissions[0].get("type") == "user"
        and permissions[0].get("role") == "owner"
    )


def assess(
    *, expected_version, code_version, reported_version, health_ok,
    env, rights_policy_verified, candidate_folder_private,
    canonical_folder_verified=False,
):
    """Pure, deterministic classification; never includes secret values."""
    flags = {k: env.get(k) == "true" for k in FEATURES}
    candidate = env.get("STAGE1_CANDIDATE_FOLDER_ID", "")
    configured_folder = str(env.get("NATIVE_GALLERY_STAGING_FOLDER_ID") or "").strip()
    origin = str(env.get("NATIVE_GALLERY_WORKER_BASE_URL") or "").strip()
    consumer = str(env.get("NATIVE_GALLERY_RUNNER_CONSUMER_ID") or "").strip()
    secret = str(env.get(REQUIRED_SECRET) or "")
    flags_off = not flags["NATIVE_GALLERY_AUTO_EXECUTE_ENABLED"]
    issues = []
    if not health_ok:
        issues.append("RUNNER_HEALTH_NOT_OK")
    if code_version != expected_version or reported_version != expected_version:
        issues.append("RUNNER_SOURCE_OR_HEALTH_VERSION_MISMATCH")
    if not rights_policy_verified:
        issues.append("EXACT_PROVIDER_MODEL_RIGHTS_NOT_CONFIGURED_OR_MATCHED")
    if not candidate_folder_private:
        issues.append("RUNNER_CREDENTIALS_CANNOT_VERIFY_PRIVATE_CANDIDATE_FOLDER")
    if not CANDIDATE_PATTERN.fullmatch(candidate):
        issues.append("CANDIDATE_FOLDER_ID_INVALID")
    if not canonical_folder_verified:
        issues.append("AIRTABLE_STAGING_SETTING_NOT_VERIFIED")
    if configured_folder and configured_folder != candidate:
        issues.append("RUNTIME_STAGING_ENV_PIN_CONFLICT")
    if not origin.startswith("https://") or "@" in origin:
        issues.append("PROTECTED_WORKER_ORIGIN_NOT_CONFIGURED")
    if len(secret) < 24:
        issues.append("RUNNER_WORKER_SHARED_SECRET_NOT_CONFIGURED")
    if not TOKEN_PATTERN.fullmatch(consumer):
        issues.append("RUNNER_CONSUMER_ID_NOT_CONFIGURED")
    if not flags_off:
        issues.append("UNATTENDED_AUTO_GENERATION_MUST_BE_DISABLED")
    # Not every actual execution gate needs to be enabled during this audit:
    # enabling those gates is a separate, operator-reviewed one-shot release.
    if any(flags[k] for k in (
        "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED",
        "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED",
        "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED",
    )):
        issues.append("LIVE_EXECUTION_FLAGS_ARE_ALREADY_ENABLED_REQUIRE_REVIEW")
    return {
        "ok": True,
        "mode": "read_only_no_generation",
        "expected_version_matches_deployed_code": code_version == expected_version,
        "expected_version_matches_live_health": reported_version == expected_version,
        "health_ok": bool(health_ok),
        "rights_policy_config_matches_exact_model": bool(rights_policy_verified),
        "candidate_folder_accessible_and_private": bool(candidate_folder_private),
        "candidate_folder_pinned_in_runner": bool(canonical_folder_verified),
        "auto_generation_disabled": flags_off,
        "production_execution_flags": {
            k: flags[k] for k in FEATURES if k != "NATIVE_GALLERY_RIGHTS_REVIEWED"
        },
        "canary_prerequisites_verified": len(issues) == 0,
        "blockers": issues,
        "source_note": "No output or media generated; external rights terms still require a named operator's review.",
    }


def live_audit(expected_version, candidate_folder_id):
    """Read only Runner health, locally configured policy, and Drive metadata."""
    # config.load_settings() loads the deployed service's .env on import.
    from config import PIPELINE_RUNNER_CODE_VERSION, load_settings
    settings = load_settings()
    env = dict(os.environ)
    env["STAGE1_CANDIDATE_FOLDER_ID"] = candidate_folder_id
    health_ok, reported_version = False, None
    try:
        with urlopen("http://127.0.0.1:3350/health", timeout=9) as response:
            raw = response.read(15000)
            health = json.loads(raw.decode("utf-8"))
            health_ok = response.status == 200 and health.get("ok") is True
            reported_version = health.get("version")
    except Exception:
        pass
    rights_policy_verified = False
    try:
        from rendering_review.native_gallery_rights_policy import (
            build_approved_native_gallery_clearance,
        )
        clearance = build_approved_native_gallery_clearance(settings)
        rights_policy_verified = callable(clearance) and getattr(
            clearance, "preferred_account", None,
        ) in ("PRIMARY", "SECONDARY")
    except Exception:
        pass
    candidate_private = False
    canonical_folder_verified = False
    if CANDIDATE_PATTERN.fullmatch(candidate_folder_id):
        try:
            from airtable.client import AirtableClient
            from rendering_review.native_gallery_staging_settings import (
                read_native_gallery_staging_setting,
            )
            canonical_folder_verified = (
                read_native_gallery_staging_setting(AirtableClient(settings))
                == candidate_folder_id
            )
        except Exception:
            pass
        try:
            from integrations.google_drive import GoogleDriveClient
            drive = GoogleDriveClient()
            meta = drive.get_file(candidate_folder_id,
                                  fields="id,mimeType,trashed,shared")
            perms = drive.list_file_permissions(candidate_folder_id)
            candidate_private = is_private_folder(meta, perms, candidate_folder_id)
        except Exception:
            pass
    return assess(
        expected_version=expected_version,
        code_version=PIPELINE_RUNNER_CODE_VERSION,
        reported_version=reported_version,
        health_ok=health_ok, env=env,
        rights_policy_verified=rights_policy_verified,
        candidate_folder_private=candidate_private,
        canonical_folder_verified=canonical_folder_verified,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--candidate-folder", required=True)
    args = parser.parse_args()
    result = live_audit(args.expected_version, args.candidate_folder)
    # This is the ONLY output line: strictly whitelisted booleans and codes.
    print("STAGE1_READINESS_JSON=" + json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
