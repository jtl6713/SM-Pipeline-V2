from __future__ import annotations

import ipaddress
import logging
import os
import re

from flask import Flask, Response, jsonify, request

from config import StageRequest, load_settings
from ai_api_preference import account_to_provider, cross_provider_failover_enabled, get_preferred_account
from ai_api_status import snapshot as ai_api_status_snapshot
from stages import a1p, c3b, i3, r2, rr2, smv1, ttd4
from stages.registry import STAGE_NAMES, get_handler, is_implemented
from audio.backfill import process_request as backfill_audio_leading_silence
from i1.openai_ideas import generate_ideas
from i1.durable_jobs import enqueue as enqueue_i1_durable, enabled as i1_durable_enabled, start_consumer as start_i1_consumer, status as i1_job_status, resume_confirmed_shortfall as resume_verified_i1_shortfall, TerminalBatchMismatch
from carousel.image_gen import build_c2_prompt, generate_carousel_png
from studio_music.processor import ingest_studio_music, trash_studio_music
from airtable.egress_monitor import install_airtable_egress_monitor, read_airtable_egress, start_runner_collector_heartbeat
install_airtable_egress_monitor()
# The same durable SQLite store receives positive process liveness even when
# the external GitHub hourly schedule is delayed or skipped. No network egress.
start_runner_collector_heartbeat()
from airtable.client import AirtableClient
from item4.clip_poster import ensure_request_clip_posters
from item4.settings import pipeline_settings
from item4.sources import download_via_media_bridge, is_studio_master_key
from integrations.google_drive import GoogleDriveClient
from studio_produce.ops_alert import send_produce_escalation
from studio_produce.processor import resume_job, start_job
from studio_produce import workload_governor
from studio_compress.processor import start_job as start_studio_compress
from ttd.client import TikTokDraftClient, load_tiktok_settings
from rendering_review.http import create_rendering_review_producer_blueprint
from rendering_review.one_job_http import create_exact_review_render_blueprint
from rendering_review.auto_dispatch import start_consumer as start_review_dispatch_consumer, snapshot as review_dispatch_snapshot
from rendering_review.media_http import create_review_media_blueprint
from factory_private_preview import create_factory_private_preview_blueprint
from rendering_review.gallery_preflight_http import create_native_gallery_preflight_blueprint
from rendering_review.native_gallery_claim_http import create_native_gallery_claim_blueprint
from rendering_review.native_gallery_launch_http import create_native_gallery_launch_blueprint
from rendering_review.native_gallery_execute_http import create_native_gallery_execute_blueprint
from rendering_review.native_gallery_readiness_http import create_native_gallery_readiness_blueprint
from rendering_review.native_gallery_auto_execute import start_consumer as start_native_gallery_consumer, snapshot as native_gallery_dispatch_snapshot
from rendering_review.native_gallery_revised_http import create_native_gallery_revised_blueprint
from rendering_review.native_gallery_preview_http import create_native_gallery_preview_blueprint

logger = logging.getLogger("pipeline-runner")
settings = load_settings()

app = Flask(__name__)


def _verify_secret() -> tuple[dict | None, int | None]:
    expected = settings.get("pipeline_runner_shared_secret", "").strip()
    if not expected:
        return None, None
    provided = request.headers.get("X-Pipeline-Secret", "")
    if provided != expected:
        return jsonify({"error": "Invalid pipeline secret"}), 401
    return None, None


def _require_loopback() -> tuple[dict | None, int | None]:
    if request.headers.get("CF-Connecting-IP") or request.headers.get("X-Forwarded-For"):
        return jsonify({"error": "Direct loopback access required"}), 403
    try:
        caller = ipaddress.ip_address(request.remote_addr or "")
    except ValueError:
        return jsonify({"error": "Loopback access required"}), 403
    if caller.is_loopback:
        return None, None
    allow_docker = os.environ.get("ALLOW_DOCKER_INTERNAL", "").strip().lower() in {"1", "true", "yes"}
    if allow_docker and (caller.is_private or caller.is_link_local):
        return None, None
    return jsonify({"error": "Loopback access required"}), 403

logger = logging.getLogger("pipeline-runner")
settings = load_settings()

app = Flask(__name__)


def recovery_read_only() -> bool:
    """Emergency outage gate: keep health/read traffic, refuse mutations."""
    return os.environ.get("PIPELINE_RUNNER_RECOVERY_READ_ONLY", "").strip().lower() in {
        "1", "true", "yes",
    }


def recovery_image_upload_allowed() -> bool:
    """Strict, isolated image intake while other recovery mutations stay frozen."""
    disabled = {"1", "true", "yes", "on"}
    return (
        recovery_read_only()
        and workload_governor.enabled()
        and bool(settings.get("pipeline_runner_shared_secret", "").strip())
        and os.environ.get("I1_DURABLE_ENABLED", "").strip().lower() not in disabled
        and os.environ.get("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED", "").strip().lower() not in disabled
        and os.environ.get("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED", "").strip().lower() not in disabled
    )


def recovery_image_classification_allowed() -> bool:
    """Only safe, authenticated single-image A3 processing during recovery."""
    return recovery_image_upload_allowed()


def recovery_producer_only_allowed() -> bool:
    """An authenticated, exact-ID producer ingress without publisher unpause."""
    if not (recovery_image_upload_allowed() and workload_governor.producer_only_recovery_enabled()):
        return False
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return False
    record_id = str(payload.get("production_request_record_id") or payload.get("record_id") or "").strip()
    if not re.fullmatch(r"rec[A-Za-z0-9]{6,}", record_id):
        return False
    target = workload_governor.producer_only_recovery_target()
    return target == "ALL" or record_id == target


RECOVERY_MEDIA_STAGES = frozenset({"smv1", "r2", "r3", "r4", "r5"})


def recovery_nonpublishing_media_allowed(stage_name: str) -> bool:
    """Exact-ID nonpublishing media work only; every publisher remains fenced."""
    if (
        stage_name not in RECOVERY_MEDIA_STAGES
        or not recovery_image_upload_allowed()
        or not workload_governor.producer_only_recovery_enabled()
        or workload_governor.producer_only_recovery_target() != "ALL"
    ):
        return False
    if request.content_length is not None and request.content_length > 4096:
        return False
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or set(payload) - {
        "output_record_id", "platform_output_id", "production_request_record_id",
        "test_run_id", "extra",
    }:
        return False
    extra = payload.get("extra") or {}
    if not isinstance(extra, dict) or set(extra) - {"max_runs", "photo_workers", "dry_run"}:
        return False
    if "max_runs" in extra and (type(extra["max_runs"]) is not int or extra["max_runs"] != 1):
        return False
    if "photo_workers" in extra and (stage_name != "smv1" or type(extra["photo_workers"]) is not int or extra["photo_workers"] != 1):
        return False
    if "dry_run" in extra and type(extra["dry_run"]) is not bool:
        return False
    if payload.get("test_run_id") and not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(payload["test_run_id"])):
        return False
    field_name = "production_request_record_id" if stage_name == "smv1" else "output_record_id"
    record_id = payload.get(field_name) if stage_name == "smv1" else (payload.get("output_record_id") or payload.get("platform_output_id"))
    if not isinstance(record_id, str) or not re.fullmatch(r"rec[A-Za-z0-9]{6,}", record_id):
        return False
    if stage_name != "smv1" and payload.get("production_request_record_id"):
        return False
    if stage_name == "smv1" and (payload.get("output_record_id") or payload.get("platform_output_id")):
        return False
    if payload.get("output_record_id") and payload.get("platform_output_id") and payload["output_record_id"] != payload["platform_output_id"]:
        return False
    return True


def recovery_idea_promotion_allowed() -> bool:
    """Only an already-submitted, exact Worker I3 approval while publishers remain fenced."""
    if not (recovery_image_upload_allowed()
            and workload_governor.producer_only_recovery_enabled()
            and workload_governor.producer_only_recovery_target() == "ALL"
            and settings.get("pipeline_runner_shared_secret", "").strip()):
        return False
    if request.content_length is not None and request.content_length > 4096:
        return False
    from studio_produce.recovery_approval import parse_recovery_promotion
    return parse_recovery_promotion(request.get_json(silent=True)) is not None


def _validate_recovery_a3(request_payload: dict) -> tuple[StageRequest | None, tuple | None]:
    """Constrain A3 to an existing, profiled Supabase image; never launch A4.

    Only one exact record id is accepted, regardless of caller-supplied flags.
    The background A3 thread retains a cross-process governor resource lease.
    """
    if not isinstance(request_payload, dict):
        return None, (jsonify({"error": "recovery_a3_targeted_only"}), 422)
    extra = request_payload.get("extra")
    allowed_extra = {"record_ids", "trigger_a4", "wait_for_next", "drain", "background"}
    if (not isinstance(extra, dict) or request_payload.keys() - {"extra"}
            or extra.keys() - allowed_extra):
        return None, (jsonify({"error": "recovery_a3_targeted_only"}), 422)
    ids = extra.get("record_ids")
    if not isinstance(ids, list) or len(ids) != 1:
        return None, (jsonify({"error": "recovery_a3_requires_one_image"}), 422)
    record_id = ids[0]
    if not isinstance(record_id, str) or not re.fullmatch(r"rec[A-Za-z0-9]{6,}", record_id):
        return None, (jsonify({"error": "recovery_a3_invalid_record_id"}), 422)
    if (extra.get("trigger_a4") is not False or extra.get("wait_for_next") is not False
            or extra.get("drain") is not False or extra.get("dry_run") is not None):
        return None, (jsonify({"error": "recovery_a3_side_effects_forbidden"}), 422)
    try:
        from airtable.client import AirtableClient  # Supabase-only compatibility API
        from airtable.constants import MEDIA_ASSETS_TABLE
        row = AirtableClient().get_record(MEDIA_ASSETS_TABLE, record_id)
    except Exception:
        logger.warning("recovery A3 cannot verify Supabase media asset", exc_info=True)
        return None, (jsonify({"error": "recovery_a3_record_unavailable"}), 503)
    fields = row.get("fields") if isinstance(row, dict) else None
    if not isinstance(fields, dict):
        return None, (jsonify({"error": "recovery_a3_record_unavailable"}), 503)
    mime = str(fields.get("MIME_Type") or "").lower()
    category = str(fields.get("Media_Class") or "").lower()
    profile = fields.get("Content_Profile")
    if not ((mime.startswith("image/") or category in {"image", "graphic"})
            and isinstance(profile, list) and len(profile) == 1
            and re.fullmatch(r"rec[A-Za-z0-9]{6,}", str(profile[0]))):
        return None, (jsonify({"error": "recovery_a3_image_profile_required"}), 422)
    if fields.get("Do_Not_Use") is True:
        return None, (jsonify({"error": "recovery_a3_asset_on_hold"}), 409)
    # All request payload fields not explicitly needed for single-image
    # classification are discarded; no caller can invoke background A4/drain.
    return StageRequest(extra={
        "record_ids": [record_id],
        "trigger_a4": False,
        "wait_for_next": False,
        "drain": False,
        "background": True,
        "max_records": 1,
    }), None


@app.before_request
def _recovery_read_only_gate():
    # Installed before every blueprint; includes production, manual resume,
    # media transfers, and publishing-related runner HTTP routes. Preserve
    # GET /health for deploy verification and independent read-only Studio.
    if recovery_read_only() and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
        # Allow ONLY release of an existing authenticated Worker lease while
        # frozen. No claim/renew may pass the recovery fence.
        if request.method.upper() == "POST" and request.path == "/internal/workload/worker-lease":
            data = request.get_json(silent=True)
            if isinstance(data, dict) and data.get("action") == "release":
                return None
        if (request.method.upper() == "POST" and request.path == "/stages/a3"
                and recovery_image_classification_allowed()):
            if request.content_length is not None and request.content_length > 8192:
                return jsonify({"error": "recovery_a3_payload_too_large"}), 413
            return None
        if (request.method.upper() == "POST" and request.path == "/jobs/studio-asset-library"
                and recovery_image_upload_allowed()):
            # The handler still requires a runner shared secret, checks image
            # type, and uses a single durable governor resource slot.
            if request.content_length is not None and request.content_length > 26 * 1024 * 1024:
                return jsonify({"error": "photo_upload_body_too_large"}), 413
            return None
        if (request.method.upper() == "POST"
                and request.path in {"/jobs/studio-produce", "/jobs/studio-produce/resume"}
                and recovery_producer_only_allowed()):
            # Governor enforces cross-process 1-job cap.
            return None
        if request.method.upper() == "POST":
            stage = request.path.removeprefix("/stages/") if request.path.startswith("/stages/") else ""
            if stage in RECOVERY_MEDIA_STAGES and recovery_nonpublishing_media_allowed(stage):
                # The handler holds a cross-process single-slot lease.
                return None
            if stage == "i3" and recovery_idea_promotion_allowed():
                # Exact, tenant-authorized Worker approval: I3 calls I4 internally.
                # It does NOT reenable provider publishing or arbitrary I3 decisions.
                return None
        response = jsonify({
            "ok": False,
            "error": "runner_recovery_read_only",
            "message": "Heavy and mutating runner operations are temporarily paused",
        })
        response.status_code = 503
        response.headers["Cache-Control"] = "no-store"
        response.headers["Retry-After"] = "120"
        return response
    return None


# Model-backed proposals are explicitly disabled until Worker conversation
# persistence and phase-1 ownership safeguards have been verified.
app.register_blueprint(create_rendering_review_producer_blueprint(settings))
app.register_blueprint(create_exact_review_render_blueprint(settings))
app.register_blueprint(create_review_media_blueprint(settings))
app.register_blueprint(create_factory_private_preview_blueprint(settings))
app.register_blueprint(create_native_gallery_preflight_blueprint(settings))
app.register_blueprint(create_native_gallery_claim_blueprint(settings))
app.register_blueprint(create_native_gallery_launch_blueprint(settings))
app.register_blueprint(create_native_gallery_execute_blueprint(settings))
app.register_blueprint(create_native_gallery_readiness_blueprint(settings))
app.register_blueprint(create_native_gallery_revised_blueprint(settings))
app.register_blueprint(create_native_gallery_preview_blueprint(settings))


@app.get('/jobs/rendering-review/dispatch-health')
def review_auto_dispatch_health():
    if not settings.get('pipeline_runner_shared_secret', '').strip():
        return jsonify(ok=False, error='runner_auth_unconfigured'), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    return jsonify(ok=True, **review_dispatch_snapshot()), 200


@app.get('/jobs/native-gallery/dispatch-health')
def native_gallery_dispatch_health():
    if not settings.get('pipeline_runner_shared_secret', '').strip():
        return jsonify(ok=False, error='runner_auth_unconfigured'), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    return jsonify(ok=True, **native_gallery_dispatch_snapshot()), 200


def _verify_secret() -> tuple[dict | None, int | None]:
    expected = settings.get("pipeline_runner_shared_secret", "").strip()
    if not expected:
        return None, None
    provided = request.headers.get("X-Pipeline-Secret", "")
    if provided != expected:
        return jsonify({"error": "Invalid pipeline secret"}), 401
    return None, None


@app.get("/admin/airtable-egress")
def durable_airtable_egress():
    """Read-only metrics. Runner shared secret required; no record details."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"ok": False, "error": "metrics_auth_unconfigured"}), 503
    denied, status = _verify_secret()
    if denied is not None:
        return denied, status
    try:
        hours = max(1, min(72, int(request.args.get("hours", "48"))))
        result = read_airtable_egress(hours)
    except (TypeError, ValueError, OSError) as error:
        return jsonify({"ok": False, "error": type(error).__name__}), 400
    return jsonify(result), 200 if result.get("ok") else 503


@app.post("/internal/workload/worker-lease")
def worker_shared_workload_lease():
    """Server-owned cross-host admission for the Cloudflare Ready queue.

    Never trusts the caller to set capacity, scope, TTL, DB path or commands.
    No database writes; durable coordinator is the existing Windows SQLite.
    """
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"ok": False, "error": "runner_auth_unconfigured"}), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    if request.content_length is not None and request.content_length > 1024:
        return jsonify({"ok": False, "error": "invalid_lease_body_size"}), 413
    # Cloudflare may use chunked HTTPS requests without Content-Length.
    # The service secret is verified before reading a bounded JSON body.
    raw_body = request.get_data(cache=True)
    if not raw_body or len(raw_body) > 1024:
        return jsonify({"ok": False, "error": "invalid_lease_body_size"}), 413
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or set(payload) != {"action", "idea_id", "token"}:
        return jsonify({"ok": False, "error": "invalid_lease_payload"}), 422
    action = payload.get("action")
    idea_id = payload.get("idea_id")
    token = payload.get("token")
    if (action not in {"claim", "renew", "release"}
            or not isinstance(idea_id, str)
            or not re.fullmatch(r"rec[A-Za-z0-9]{14}", idea_id)
            or not isinstance(token, str)
            or not re.fullmatch(
                r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
                token,
            )):
        return jsonify({"ok": False, "error": "invalid_lease_identity"}), 422
    try:
        if action == "claim":
            granted = workload_governor.claim_worker_heavy(idea_id, token)
        elif action == "renew":
            granted = workload_governor.renew_worker_heavy(idea_id, token)
        else:
            released = workload_governor.release_worker_heavy(idea_id, token)
            return jsonify({"ok": True, "released": released}), 200
    except (OSError, RuntimeError, ValueError):
        logger.exception("shared worker admission storage unavailable")
        return jsonify({"ok": False, "error": "admission_store_unavailable"}), 503
    # All errors and lack of capacity fail closed; no side effects to source
    # idea status, R2 queues, Supabase or provider publication.
    response = jsonify({"ok": True, "admitted": granted, "retry_after_seconds": 30})
    response.headers["Cache-Control"] = "no-store"
    if not granted:
        response.headers["Retry-After"] = "30"
    return response, 200 if granted else 429


@app.post("/internal/quality/native-media-rebuild")
def quality_native_media_rebuild():
    """Authenticated, governed, immutable CDN stage only."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify(ok=False, error="runner_auth_unconfigured"), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    if request.content_length is not None and request.content_length > 24576:
        return jsonify(ok=False, error="rebuild_payload_too_large"), 413
    raw = request.get_data(cache=True)
    if not raw or len(raw) > 24576:
        return jsonify(ok=False, error="rebuild_payload_too_large"), 413
    from studio_produce.quality_native_media_rebuild import stage, validate
    payload = request.get_json(silent=True)
    try:
        validate(payload)
    except ValueError:
        return jsonify(ok=False, error="invalid_rebuild_request"), 422
    try:
        return jsonify(stage(payload)), 200
    except Exception:
        logger.warning("quality native media rebuild blocked or incomplete")
        return jsonify(ok=False, error="rebuild_unverified"), 503


@app.get("/internal/workload/snapshot")
def shared_workload_readonly_snapshot():
    """Authenticated and bounded Worker QA proxy; no queue/Supabase writes."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"ok": False, "error": "runner_auth_unconfigured"}), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    try:
        state = workload_governor.snapshot()
    except (OSError, RuntimeError, ValueError):
        logger.exception("shared workload snapshot unavailable")
        return jsonify({"ok": False, "error": "governor_diagnostics_unavailable"}), 503
    response = jsonify({"ok": True, **state})
    response.headers["Cache-Control"] = "private, no-store"
    return response, 200


@app.get("/admin/workload")
def workload_diagnostics():
    """Local-only authenticated runner workload diagnostics (never mutate jobs)."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"ok": False, "error": "runner_auth_unconfigured"}), 503
    denied, code = _require_loopback()
    if denied is not None:
        return denied, code
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    try:
        snapshot = workload_governor.snapshot()
    except (OSError, RuntimeError, ValueError) as error:
        logger.warning("governor diagnostics unavailable: %s", type(error).__name__)
        return jsonify({"ok": False, "error": "governor_diagnostics_unavailable"}), 503
    return jsonify({"ok": True, **snapshot}), 200


@app.get("/health")
def health():
    from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
    from airtable.egress_monitor import read_airtable_egress
    from supabase_reads import runner_table_read_source

    try:
        airtable_activity = read_airtable_egress(6).get("activity")
    except (OSError, ValueError):
        airtable_activity = None
    if not airtable_activity:
        airtable_activity = {
            "ok": False,
            "window_hours": 6,
            "reason": "egress_unavailable",
            "read_attempts": None,
            "write_attempts": None,
            "any_read": None,
            "any_write": None,
            "any_activity": None,
        }

    return jsonify(
        {
            "ok": True,
            "service": "pipeline-runner",
            "version": settings["service_version"],
            "studio_native_gallery_companion_2873": True,
            "airtable_activity": airtable_activity,
            "studio_write_source": settings.get("studio_write_source") or "airtable",
            "studio_phase6_write_source": settings.get("studio_phase6_write_source") or "airtable",
            "studio_runner_output_read_source": runner_table_read_source(settings, PLATFORM_OUTPUTS_TABLE),
            "studio_runner_content_read_source": runner_table_read_source(settings, CONTENT_ITEMS_TABLE),
            "ig_publish_lease_required": os.environ.get("IG_PUBLISH_LEASE_REQUIRED","").strip().lower() == "true",
            "ig_publish_lease_protocol_version": 1,
            "supabase_pipeline_writes": bool(settings.get("supabase_url") and settings.get("supabase_service_role_key")),
            "recovery_read_only": recovery_read_only(),
            "recovery_image_upload_enabled": recovery_image_upload_allowed(),
            "recovery_image_classification_enabled": recovery_image_classification_allowed(),
            "recovery_a3_metadata_write_scoped": recovery_image_classification_allowed(),
            "workload_governor_enabled": workload_governor.enabled(),
            "recovery_producer_only_enabled": workload_governor.producer_only_recovery_enabled(),
            "recovery_nonpublishing_media_stages": (
                sorted(RECOVERY_MEDIA_STAGES)
                if workload_governor.producer_only_recovery_enabled()
                and workload_governor.producer_only_recovery_target() == "ALL"
                and recovery_image_upload_allowed()
                else []
            ),
            "recovery_producer_scope": (
                "all_governed_requests" if workload_governor.producer_only_recovery_target() == "ALL"
                else "exact_request" if workload_governor.producer_only_recovery_enabled()
                else "disabled"
            ),
            "openai_account": settings.get("openai_account"),
            "t1_shorten_to_footage": True,
            "stages_registered": len(STAGE_NAMES),
            "stages_implemented": sum(1 for name in STAGE_NAMES if is_implemented(name)),
            "i1_durable_jobs": i1_durable_enabled(),
            "public_base_url": settings.get("public_base_url") or None,
            "jobs": [
                {"name": "studio-clip-poster", "path": "/jobs/studio-clip-poster"},
                {"name": "studio-compress", "path": "/jobs/studio-compress"},
                {"name": "studio-produce", "path": "/jobs/studio-produce"},
                {"name": "studio-produce-resume", "path": "/jobs/studio-produce/resume"},
                {"name": "studio-produce-ops-alert", "path": "/jobs/studio-produce/ops-alert"},
                {"name": "studio-music-library", "path": "/jobs/studio-music-library"},
                {"name": "studio-asset-library", "path": "/jobs/studio-asset-library"},
                {"name": "studio-asset-library-job", "path": "/jobs/studio-asset-library/<job_id>"},
                {"name": "studio-asset-watermark", "path": "/jobs/studio-asset-watermark"},
                {"name": "studio-asset-library-rename", "path": "/jobs/studio-asset-library-rename"},
                {"name": "studio-ai-image", "path": "/jobs/studio-ai-image"},
                {"name": "autonomous-pick", "path": "/jobs/autonomous-pick"},
                {"name": "tiktok-analytics", "path": "/jobs/tiktok-analytics"},
            ],
        }
    )


@app.get("/ai-api/status")
def ai_api_status():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    preferred_account = get_preferred_account(settings)
    preferred_provider = account_to_provider(preferred_account)
    failover_provider = "Azure" if preferred_provider == "OpenAI" else "OpenAI"
    runtime = ai_api_status_snapshot()
    last_primary = runtime.get("last_primary") if isinstance(runtime.get("last_primary"), dict) else None
    return jsonify(
        {
            "ok": True,
            "preferred_provider": preferred_provider,
            "failover_provider": failover_provider,
            "failover_enabled": cross_provider_failover_enabled(settings),
            "current_provider": runtime.get("provider"),
            "failover_active": bool(runtime.get("failover")),
            "last_success_at": runtime.get("last_success_at"),
            "status_code": runtime.get("status_code"),
            "last_primary_stage": (last_primary or {}).get("stage"),
            "last_primary_kind": (last_primary or {}).get("kind"),
            "last_primary_at": (last_primary or {}).get("at"),
            "last_primary_failover": bool((last_primary or {}).get("failover")),
        }
    )


@app.get("/internal/drive-media/<file_id>")
def internal_drive_media(file_id: str):
    denied, status = _require_loopback()
    if denied is not None:
        return denied, status
    if not file_id or len(file_id) > 256 or not all(char.isalnum() or char in "_-" for char in file_id):
        return jsonify({"error": "Invalid Drive file ID"}), 400
    # Stream private Google Drive originals through localhost only. Avoid
    # buffering 180–450 MB footage in the Runner process when A1S hands it to
    # the local Video Compressor. No public URL or OAuth token is exposed.
    import requests

    drive = GoogleDriveClient()
    upstream = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        params={"alt": "media", "supportsAllDrives": "true"},
        headers={"Authorization": f"Bearer {drive.access_token()}"},
        stream=True,
        timeout=(30, 600),
    )
    try:
        upstream.raise_for_status()
    except Exception:
        upstream.close()
        raise
    mime = (upstream.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip()
    length = str(upstream.headers.get("Content-Length") or "").strip()

    def chunks():
        try:
            for chunk in upstream.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    headers = {"Cache-Control": "no-store"}
    if length.isdigit():
        headers["Content-Length"] = length
    return Response(chunks(), mimetype=mime, headers=headers)


@app.get("/internal/studio-master")
def internal_studio_master():
    denied, status = _require_loopback()
    if denied is not None:
        return denied, status
    key = str(request.args.get("key") or "").strip()
    if not is_studio_master_key(key) or ".." in key or len(key) > 512:
        return jsonify({"error": "Invalid key"}), 400
    content, mime_type = download_via_media_bridge(key, pipeline_settings())
    return Response(
        content,
        mimetype=mime_type or "video/mp4",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/stages")
def list_stages():
    return jsonify(
        {
            "stages": [
                {
                    "name": name,
                    "path": f"/stages/{name}",
                    "implemented": is_implemented(name),
                }
                for name in STAGE_NAMES
            ]
        }
    )


@app.post("/jobs/i1-durable")
def submit_durable_i1():
    """Accept after a durable disk commit; never run model work in the HTTP turn."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"error": "runner authentication not configured"}), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    if not i1_durable_enabled():
        return jsonify({"error": "I1 durable jobs not enabled on runner"}), 503
    body = request.get_json(silent=True) or {}
    try:
        result = enqueue_i1_durable(
            str(body.get("batch_record_id") or "").strip(),
            str(body.get("profile_record_id") or "").strip(),
            body.get("requested_count"),
            str(body.get("quality") or "").strip(),
            str(body.get("asset_sourcing_mode") or "balanced").strip(),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except (OSError, RuntimeError) as exc:
        logger.exception("I1 queue admission failed")
        return jsonify({"error": str(exc)}), 503
    return jsonify({"ok": True, **result}), 202


@app.post("/jobs/i1-durable/resume-verified-shortfall")
def resume_durable_i1_verified_shortfall():
    """One-time operator action: only an exact failed uniqueness shortfall."""
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"error": "runner authentication not configured"}), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    if not i1_durable_enabled():
        return jsonify({"error": "I1 durable jobs not enabled on runner"}), 503
    if request.query_string:
        return jsonify({"error": "query parameters are forbidden"}), 400
    body = request.get_json(silent=True)
    allowed = {"batch_record_id", "profile_record_id", "requested_count",
               "quality", "confirm_verified_only"}
    if (not isinstance(body, dict) or set(body) != allowed or
            body.get("confirm_verified_only") is not True):
        return jsonify({"error": "explicit exact verified-shortfall request required"}), 400
    try:
        result = resume_verified_i1_shortfall(
            body["batch_record_id"], body["profile_record_id"],
            body["requested_count"], body["quality"])
    except (ValueError, TerminalBatchMismatch):
        # Do not reveal live linked ideas or internal credential details.
        return jsonify({"error": "batch is not an eligible verified shortfall"}), 409
    except (OSError, RuntimeError):
        logger.exception("I1 verified shortfall recovery unavailable")
        return jsonify({"error": "verified shortfall recovery unavailable"}), 503
    response = jsonify({"ok": True, **result})
    response.headers["Cache-Control"] = "no-store"
    return response, 202


@app.get("/jobs/i1-durable/<batch_id>")
def read_durable_i1(batch_id: str):
    if not settings.get("pipeline_runner_shared_secret", "").strip():
        return jsonify({"error": "runner authentication not configured"}), 503
    denied, code = _verify_secret()
    if denied is not None:
        return denied, code
    if not i1_durable_enabled():
        return jsonify({"error": "I1 durable jobs not enabled on runner"}), 503
    try:
        job = i1_job_status(batch_id)
    except (OSError, RuntimeError) as exc:
        return jsonify({"error": str(exc)}), 503
    return (jsonify({"ok": True, "job": job}), 200) if job else (jsonify({"error": "job not found"}), 404)


@app.post("/stages/<stage_name>")
def run_stage(stage_name: str):
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    recovery_media = False
    recovery_approval = False
    if recovery_read_only():
        if stage_name == "a3" and recovery_image_classification_allowed():
            body, denied = _validate_recovery_a3(request.get_json(silent=True) or {})
            if denied is not None:
                return denied
        elif recovery_nonpublishing_media_allowed(stage_name):
            recovery_media = True
            body = StageRequest.from_dict(request.get_json(silent=True))
            # Exact request, one poll/crop/asset action per admission.
            body.extra["max_runs"] = 1
            if stage_name == "smv1":
                body.extra["photo_workers"] = 1
        elif stage_name == "i3" and recovery_idea_promotion_allowed():
            recovery_approval = True
            body = StageRequest.from_dict(request.get_json(silent=True))
        else:
            return jsonify({"error": "runner_recovery_read_only"}), 503
    else:
        body = StageRequest.from_dict(request.get_json(silent=True))
    handler = get_handler(stage_name)
    if recovery_media:
        try:
            with workload_governor.resource_slot("recovery_media_stage", limit=1):
                result = handler(body)
        except workload_governor.AdmissionDeferred:
            return jsonify({"error": "recovery_media_capacity_deferred"}), 503
    elif recovery_approval:
        from studio_produce.recovery_approval import validate_recovery_promotion_authority
        from studio_produce.recovery_approval import parse_recovery_promotion
        try:
            with workload_governor.resource_slot("recovery_idea_promotion", limit=1):
                owner_id, idea_id = parse_recovery_promotion(request.get_json(silent=True))
                validate_recovery_promotion_authority(owner_id, idea_id)
                result = handler(body)
        except workload_governor.AdmissionDeferred:
            return jsonify({"error": "recovery_approval_capacity_deferred"}), 503
        except (ValueError, RuntimeError, LookupError) as error:
            logger.warning("recovery approval rejected before I3: %s", type(error).__name__)
            return jsonify({"error": "recovery_approval_preflight_failed",
                            "reason": str(error)[:140]}), 409
        # I3 'processed' alone is not a durable approval: I4 must have
        # created exactly one Content Item, or leave the Worker Submitted.
        i4_result = (result.details.get("run") or {}).get("i4") or {}
        if (result.status != "ok" or not i4_result.get("content_item_id")):
            return jsonify({"error": "recovery_i4_not_confirmed",
                            "stage": "i3", "recovery_approval_hold": True}), 503
    else:
        result = handler(body)

    status_code = 200
    if result.status == "not_implemented":
        status_code = 501
    elif result.status == "deferred":
        status_code = 202
    elif result.status == "error":
        status_code = 422
    elif result.status == "skipped":
        status_code = 200

    logger.info("stage=%s status=%s message=%s", result.stage, result.status, result.message)
    response = result.to_dict()
    if recovery_approval:
        # Worker uses this attested flag to seed all new Platform Outputs held,
        # never approved or scheduled, while the global publisher stays fenced.
        response["recovery_approval_hold"] = True
    return jsonify(response), status_code


@app.post("/stages/r2/drain")
def run_r2_drain():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    body = StageRequest.from_dict(request.get_json(silent=True))
    extra = dict(body.extra or {})
    extra.setdefault("max_runs", 1)
    body.extra = extra
    result = r2.run(body)
    status_code = 202 if result.status == "deferred" else (422 if result.status == "error" else 200)
    logger.info("stage=r2-drain status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/rr2/<token>", methods=["GET", "POST"])
def rr2_email_hook(token: str):
    expected = str(settings.get("rr2_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    record_id = (
        request.values.get("record_id")
        or request.values.get("output_record_id")
        or ""
    ).strip()
    decision = (request.values.get("decision") or "").strip()
    body = StageRequest.from_dict(
        {
            "output_record_id": record_id,
            "extra": {"decision": decision},
        }
    )
    result = rr2.run(body)
    status_code = 422 if result.status == "error" else 200
    logger.info("stage=rr2-hook status=%s message=%s", result.status, result.message)
    wants_html = "text/html" in (request.headers.get("Accept") or "") or request.method == "GET"
    if wants_html:
        run = result.details.get("run") or {}
        html = (
            "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
            f"<h1>Render review decision</h1>"
            f"<p>{result.message}</p>"
            f"<p>Output {run.get('output_id') or record_id}: "
            f"{run.get('decision_label') or decision or 'no decision'}</p>"
            "</body></html>"
        )
        return html, status_code, {"Content-Type": "text/html; charset=utf-8"}
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/c3b/<token>", methods=["GET", "POST"])
def c3b_email_hook(token: str):
    expected = str(settings.get("c3b_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    action = (request.values.get("action") or "").strip()
    slide_id = (request.values.get("slide_id") or request.values.get("slide_record_id") or "").strip()
    content_item_id = (
        request.values.get("content_item_id") or request.values.get("content_record_id") or ""
    ).strip()
    notes = request.values.get("notes") or ""
    test_run_id = (request.values.get("test_run_id") or "").strip()
    body = StageRequest.from_dict(
        {
            "content_item_record_id": content_item_id or None,
            "test_run_id": test_run_id or None,
            "extra": {
                "action": action,
                "slide_id": slide_id,
                "notes": notes,
            },
        }
    )
    result = c3b.run(body)
    status_code = 400 if result.status == "skipped" and (result.details.get("run") or {}).get("reason") == "unsupported_action" else (
        422 if result.status == "error" else 200
    )
    logger.info("stage=c3b-hook status=%s message=%s", result.status, result.message)
    html = (result.details.get("run") or {}).get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>Carousel review</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/hooks/i3/<token>", methods=["GET", "POST"])
def i3_email_hook(token: str):
    expected = str(settings.get("i3_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    extra = {key: value for key, value in request.values.items()}
    body = StageRequest.from_dict({"extra": extra})
    result = i3.run(body)
    status_code = 422 if result.status == "error" else 200
    logger.info("stage=i3-hook status=%s message=%s", result.status, result.message)
    html = (result.details.get("run") or {}).get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>Idea review</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/hooks/a1p/<token>", methods=["GET", "POST"])
def a1p_poll_hook(token: str):
    expected = str(settings.get("a1p_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    extra = {key: value for key, value in request.values.items()}
    json_body = request.get_json(silent=True) or {}
    if isinstance(json_body, dict):
        extra.update(json_body)
    body = StageRequest.from_dict({"extra": extra})
    result = a1p.run(body)
    status_code = 202 if result.status == "deferred" else (422 if result.status == "error" else 200)
    logger.info("stage=a1p-hook status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/ttd4", methods=["GET", "POST"])
def ttd4_completion_hook():
    record_id = (
        request.values.get("record_id")
        or request.values.get("output_record_id")
        or ""
    ).strip()
    action = (request.values.get("action") or "form").strip()
    token = (request.values.get("token") or "").strip()
    platform_post_url = (request.values.get("platform_post_url") or "").strip()
    music_completed = (request.values.get("music_completed") or "").strip()
    form_url = request.url.split("?")[0]
    body = StageRequest.from_dict(
        {
            "output_record_id": record_id or None,
            "extra": {
                "action": action,
                "token": token,
                "platform_post_url": platform_post_url,
                "music_completed": music_completed,
                "form_url": form_url,
            },
        }
    )
    result = ttd4.run(body)
    run = result.details.get("run") or {}
    status_code = int(run.get("http_status") or (422 if result.status == "error" else 200))
    logger.info("stage=ttd4-hook status=%s message=%s", result.status, result.message)
    html = run.get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>TikTok completion</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.post("/stages/smv1/drain")
def run_smv1_drain():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    body = StageRequest.from_dict(request.get_json(silent=True))
    if not body.production_request_record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    extra = dict(body.extra or {})
    extra.setdefault("max_runs", 8)
    body.extra = extra
    result = smv1.run(body)
    status_code = 422 if result.status == "error" else 202 if result.status == "deferred" else 200
    logger.info("stage=smv1-drain status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


def _studio_produce_body() -> tuple[str, bool]:
    payload = request.get_json(silent=True) or {}
    record_id = str(
        payload.get("production_request_record_id")
        or payload.get("record_id")
        or ""
    ).strip()
    resume = bool(payload.get("resume"))
    return record_id, resume


@app.post("/jobs/studio-music-library")
def run_studio_music_library():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    upload = request.files.get("file")
    filename = str(request.form.get("filename") or getattr(upload, "filename", "") or "").strip()
    content = upload.read() if upload else b""
    if not content:
        return jsonify({"error": "file is required"}), 422
    try:
        result = ingest_studio_music(content=content, filename=filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-music-library ingest failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-music-library file=%s drive=%s",
        result.get("filename"),
        result.get("google_drive_file_id"),
    )
    return jsonify(result), 201


@app.post("/jobs/studio-music-library-delete")
def run_studio_music_library_delete():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    file_id = str(payload.get("google_drive_file_id") or payload.get("file_id") or "").strip()
    try:
        result = trash_studio_music(file_id=file_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-music-library-delete failed")
        return jsonify({"error": str(exc)}), 502
    logger.info("job=studio-music-library-delete drive=%s", result.get("google_drive_file_id"))
    return jsonify(result), 200


@app.post("/jobs/studio-asset-library")
def run_studio_asset_library():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    if recovery_read_only() and not recovery_image_upload_allowed():
        return jsonify({"error": "image_upload_recovery_unavailable"}), 503
    upload = request.files.get("file")
    filename = str(request.form.get("filename") or getattr(upload, "filename", "") or "").strip()
    mime_type = str(request.form.get("mime_type") or getattr(upload, "mimetype", "") or "").strip()
    if recovery_read_only():
        from studio_library.processor import classify_library_file
        try:
            spec = classify_library_file(filename=filename, mime_type=mime_type)
        except ValueError:
            return jsonify({"error": "only_photo_uploads_during_recovery"}), 415
        if spec.get("kind") != "image":
            return jsonify({"error": "only_photo_uploads_during_recovery"}), 503
    profile_name = str(request.form.get("profile_name") or request.form.get("content_profile_name") or "").strip()
    skip_source_raw = str(request.form.get("skip_source_master") or "").strip().lower()
    skip_source_master = skip_source_raw in {"1", "true", "yes", "on"}
    override_raw = str(request.form.get("override_overlay_hold") or "").strip().lower()
    override_overlay_hold = override_raw in {"1", "true", "yes", "on"}
    async_raw = str(request.form.get("async") or request.args.get("async") or "").strip().lower()
    # Default async: Worker→tunnel cannot hold screen+watermark+Drive in one request.
    # Pass async=0 only for local/sync diagnostics.
    async_mode = async_raw not in {"0", "false", "no", "off"}
    # Bounded read prevents unbounded memory even for chunked requests with
    # an absent or incorrect Content-Length header.
    content = (upload.read(25 * 1024 * 1024 + 1) if recovery_read_only()
               else upload.read()) if upload else b""
    if not content:
        return jsonify({"error": "file is required"}), 422
    if recovery_read_only() and len(content) > 25 * 1024 * 1024:
        return jsonify({"error": "photo_exceeds_25_mb_limit"}), 413
    if recovery_read_only():
        # Sync ingest circumvents bounded asynchronous claims; force async.
        async_mode = True
    if async_mode:
        from studio_library.async_jobs import start_library_ingest_job
        try:
            job_id = start_library_ingest_job(
                content=content,
                filename=filename,
                mime_type=mime_type,
                profile_name=profile_name,
                skip_source_master=skip_source_master,
                override_overlay_hold=override_overlay_hold,
            )
        except RuntimeError as exc:
            if str(exc) == "library_ingest_capacity":
                reply = jsonify({"error": "library_ingest_capacity", "retry_after_seconds": 30})
                reply.headers["Retry-After"] = "30"
                return reply, 429
            raise
        logger.info(
            "job=studio-asset-library async accepted job_id=%s file=%s override=%s",
            job_id,
            filename,
            override_overlay_hold,
        )
        return jsonify({"ok": True, "status": "processing", "job_id": job_id}), 202
    from studio_library.processor import ingest_studio_library_asset
    try:
        result = ingest_studio_library_asset(
            content=content,
            filename=filename,
            mime_type=mime_type,
            profile_name=profile_name,
            skip_source_master=skip_source_master,
            override_overlay_hold=override_overlay_hold,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-asset-library ingest failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-asset-library file=%s drive=%s kind=%s",
        result.get("filename"),
        result.get("google_drive_file_id"),
        result.get("kind"),
    )
    return jsonify(result), 201


@app.get("/jobs/studio-asset-library/recovery-lookup")
def lookup_original_story_video_in_drive():
    """Read-only exact-name lookup using the Runner's existing Drive OAuth.

    No Drive credentials, raw media, or arbitrary search expression crosses to
    Studio; a failed or incomplete listing must never authorize re-upload.
    """
    if not str(settings.get("pipeline_runner_shared_secret") or "").strip():
        return jsonify(ok=False, error="runner_auth_unconfigured"), 503
    denied, status = _verify_secret()
    if denied is not None:
        return denied, status

    filename = str(request.args.get("filename") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,90}-Scene-[1-9][0-9]{0,2}-[0-9a-f]{8}\.mp4", filename):
        return jsonify(ok=False, error="invalid_original_video_filename"), 422
    # The filename comes from Studio's original immutable paid-generation run.
    # No client-provided Drive query, folder, or token can be supplied.
    escaped = filename  # Validated safe ASCII; no quotes or backslashes.
    query = f"name = '{escaped}' and trashed = false"
    try:
        files = GoogleDriveClient().list_files(
            query=query, page_size=100,
            fields="files(id,name,mimeType,size,trashed,parents)",
        )
    except Exception:
        logger.exception("studio video recovery Drive lookup unavailable")
        return jsonify(ok=False, error="drive_lookup_unavailable"), 503
    if not isinstance(files, list) or len(files) > 1000:
        return jsonify(ok=False, error="drive_lookup_incomplete"), 503
    safe = [
        {key: entry.get(key) for key in ("id", "name", "mimeType", "size", "trashed", "parents")}
        for entry in files if isinstance(entry, dict)
    ]
    if len(safe) != len(files):
        return jsonify(ok=False, error="drive_lookup_incomplete"), 503
    reply = jsonify(ok=True, complete=True, files=safe)
    reply.headers["Cache-Control"] = "no-store"
    return reply, 200


@app.get("/jobs/studio-asset-library/<job_id>")
def get_studio_asset_library_job(job_id: str):
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    from studio_library.async_jobs import get_library_ingest_job
    job = get_library_ingest_job(job_id)
    if not job:
        return jsonify({"error": "unknown studio-asset-library job", "job_id": job_id}), 404
    return jsonify(job), 200


@app.post("/jobs/studio-asset-watermark")
def run_studio_asset_watermark():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    file_id = str(payload.get("google_drive_file_id") or payload.get("file_id") or "").strip()
    filename = str(payload.get("filename") or payload.get("name") or "asset").strip()
    mime_type = str(payload.get("mime_type") or "").strip()
    profile_name = str(payload.get("profile_name") or payload.get("content_profile_name") or "").strip()
    from studio_library.processor import watermark_existing_drive_asset
    try:
        result = watermark_existing_drive_asset(
            file_id=file_id,
            filename=filename,
            mime_type=mime_type,
            profile_name=profile_name,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-asset-watermark failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-asset-watermark source=%s output=%s profile=%s",
        file_id,
        result.get("google_drive_file_id"),
        profile_name,
    )
    return jsonify(result), 200


@app.post("/jobs/studio-asset-library-delete")
def run_studio_asset_library_delete():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    file_id = str(payload.get("google_drive_file_id") or payload.get("file_id") or "").strip()
    from studio_library.processor import trash_studio_library_asset
    try:
        result = trash_studio_library_asset(file_id=file_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-asset-library-delete failed")
        return jsonify({"error": str(exc)}), 502
    logger.info("job=studio-asset-library-delete drive=%s", result.get("google_drive_file_id"))
    return jsonify(result), 200


@app.post("/jobs/studio-asset-library-rename")
def run_studio_asset_library_rename():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    file_id = str(payload.get("google_drive_file_id") or payload.get("file_id") or "").strip()
    filename = str(payload.get("filename") or payload.get("name") or "").strip()
    from studio_library.processor import rename_studio_library_asset
    try:
        result = rename_studio_library_asset(file_id=file_id, filename=filename)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-asset-library-rename failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-asset-library-rename drive=%s file=%s",
        result.get("google_drive_file_id"),
        result.get("filename"),
    )
    return jsonify(result), 200


@app.post("/jobs/tiktok-analytics")
def run_tiktok_analytics():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    profile = str(payload.get("profile") or payload.get("theme") or "chicago").strip()
    video_ids = payload.get("video_ids") or []
    if isinstance(video_ids, str):
        video_ids = [video_ids]
    if not isinstance(video_ids, list):
        return jsonify({"error": "video_ids must be an array"}), 422
    # Reuse the existing TTD credential resolver. The Studio caller never sees
    # the TikTok worker secret; it only authenticates to this runner.
    synthetic_output = {"fields": {"Profile_Name": profile}}
    try:
        resolved = load_tiktok_settings(
            pipeline_settings(AirtableClient()),
            output=synthetic_output,
            client=AirtableClient(),
        )
        client = TikTokDraftClient(base_url=resolved["url"], secret=resolved["secret"])
        upstream_status, result = client.analytics_videos([str(item) for item in video_ids])
    except Exception as exc:
        logger.exception("tiktok-analytics failed")
        return jsonify({"error": str(exc)}), 502
    if upstream_status >= 400:
        return jsonify(result), upstream_status
    return jsonify(result), 200


@app.post("/jobs/studio-ai-image")
def run_studio_ai_image():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    prompt = str(payload.get("prompt") or "").strip()
    platform = str(payload.get("platform") or "TikTok").strip() or "TikTok"
    ratio = str(payload.get("ratio") or "9:16").strip() or "9:16"
    if not prompt:
        return jsonify({"error": "prompt is required"}), 422
    try:
        built = build_c2_prompt(prompt, platform=platform, ratio=ratio)
        png = generate_carousel_png(built, ratio=ratio)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-ai-image failed")
        return jsonify({"error": str(exc)}), 502
    logger.info("job=studio-ai-image platform=%s ratio=%s bytes=%s", platform, ratio, len(png))
    return Response(
        png,
        mimetype="image/png",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/jobs/autonomous-pick")
def run_autonomous_pick():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    prompt = str(payload.get("prompt") or "").strip()
    preferred_provider = str(payload.get("preferred_provider") or "").strip() or None
    if not prompt:
        return jsonify({"error": "prompt is required"}), 422
    try:
        generated = (generate_ideas(prompt, preferred_account=preferred_provider) if preferred_provider else generate_ideas(prompt))
    except Exception as exc:
        logger.exception("autonomous-pick failed")
        return jsonify({"error": str(exc)}), 502
    parsed = generated.get("parsed") if isinstance(generated, dict) else None
    if not isinstance(parsed, dict):
        return jsonify({"error": "I1 OpenAI response was not a JSON object"}), 502
    logger.info("job=autonomous-pick keys=%s", sorted(parsed.keys()))
    return jsonify({"ok": True, "parsed": parsed}), 200


@app.post("/jobs/studio-audio-leading-silence")
def run_studio_audio_leading_silence():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    record_ids = payload.get("record_ids") or payload.get("recordIds") or []
    if isinstance(record_ids, str):
        record_ids = [record_ids]
    if not isinstance(record_ids, list):
        return jsonify({"error": "record_ids must be an array"}), 422
    try:
        result = backfill_audio_leading_silence(
            dry_run=bool(payload.get("dry_run")),
            force=bool(payload.get("force")),
            record_ids=[str(item) for item in record_ids],
        )
    except Exception as exc:
        logger.exception("studio-audio-leading-silence failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-audio-leading-silence dry_run=%s matched=%s capped=%s failed=%s",
        result.get("dry_run"),
        result.get("matched"),
        result.get("capped"),
        result.get("failed"),
    )
    return jsonify(result), 200


@app.post("/jobs/studio-clip-poster")
def run_studio_clip_poster():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    record_id = str(
        payload.get("production_request_record_id")
        or payload.get("record_id")
        or ""
    ).strip()
    source_asset_id = str(payload.get("source_asset_id") or payload.get("asset_id") or "").strip()
    if not record_id.startswith("rec"):
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = ensure_request_clip_posters(
            AirtableClient(),
            record_id,
            source_asset_id=source_asset_id,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-clip-poster failed")
        return jsonify({"error": str(exc)}), 502
    logger.info(
        "job=studio-clip-poster request=%s asset=%s posters=%s ready=%s",
        record_id,
        source_asset_id or "*",
        len(result.get("posters") or []),
        result.get("already_ready"),
    )
    return jsonify(result), 200


@app.post("/jobs/studio-compress")
def run_studio_compress():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    payload = request.get_json(silent=True) or {}
    record_id = str(
        payload.get("production_request_record_id")
        or payload.get("record_id")
        or ""
    ).strip()
    source_asset_id = str(payload.get("source_asset_id") or payload.get("asset_id") or "").strip()
    if not record_id.startswith("rec"):
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = start_studio_compress(record_id, source_asset_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-compress start failed")
        return jsonify({"error": str(exc)}), 500
    logger.info(
        "job=studio-compress accepted=%s request=%s asset=%s running=%s",
        result.get("accepted"),
        record_id,
        source_asset_id or "*",
        not result.get("already_running"),
    )
    return jsonify({"ok": True, **result}), 202


@app.post("/jobs/studio-produce")
def run_studio_produce():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    record_id, resume = _studio_produce_body()
    if not record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = start_job(record_id, resume=resume)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-produce start failed")
        return jsonify({"error": str(exc)}), 500
    logger.info(
        "job=studio-produce accepted=%s request=%s step=%s",
        result.get("accepted"),
        record_id,
        (result.get("job") or {}).get("step"),
    )
    return jsonify({"ok": True, **result}), 202


@app.post("/jobs/studio-produce/resume")
def run_studio_produce_resume():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    record_id, _ = _studio_produce_body()
    if not record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = resume_job(record_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-produce resume failed")
        return jsonify({"error": str(exc)}), 500
    logger.info(
        "job=studio-produce-resume accepted=%s request=%s step=%s",
        result.get("accepted"),
        record_id,
        (result.get("job") or {}).get("step"),
    )
    return jsonify({"ok": True, **result}), 202


@app.post("/jobs/studio-produce/ops-alert")
def run_studio_produce_ops_alert():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    body = request.get_json(silent=True) or {}
    record_id = str(body.get("production_request_record_id") or "").strip()
    job = body.get("job") if isinstance(body.get("job"), dict) else {}
    outputs = body.get("outputs") if isinstance(body.get("outputs"), list) else None
    if not record_id.startswith("rec"):
        return jsonify({"error": "production_request_record_id is required"}), 422
    result = send_produce_escalation(request_id=record_id, job=job, outputs=outputs)
    status_code = 200 if result.get("ok") else 502
    logger.info(
        "job=studio-produce-ops-alert request=%s ok=%s gmail=%s",
        record_id,
        result.get("ok"),
        result.get("gmail_message_id"),
    )
    return jsonify(result), status_code


def main() -> None:
    logging.basicConfig(level=settings.get("log_level", "info").upper())
    start_i1_consumer()  # disabled by default; startup fails if the configured spool is not durable
    start_review_dispatch_consumer()  # protected, off by default; bounded and fail-closed
    start_native_gallery_consumer(settings)  # explicitly opt-in C5/C6; fail closed
    app.run(host=settings["host"], port=settings["port"], debug=False)


if __name__ == "__main__":
    main()
