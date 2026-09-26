from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


StageStatus = Literal["ok", "skipped", "deferred", "not_implemented", "error"]


def _without_retired_make_urls(settings: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(settings)
    for key, value in list(cleaned.items()):
        if isinstance(value, str) and "hook.us2.make.com" in value:
            cleaned[key] = ""
        if key.startswith("stage_backend_") and value == "make":
            cleaned[key] = "python"
    return cleaned


@lru_cache
def load_settings() -> dict[str, Any]:
    openai_account = os.environ.get(
        "OPENAI_ACCOUNT", "PRIMARY"
    ).strip().upper()

    if openai_account not in {"PRIMARY", "SECONDARY"}:
        raise RuntimeError(
            "OPENAI_ACCOUNT must be PRIMARY or SECONDARY"
        )

    openai_api_key_primary = os.environ.get("OPENAI_API_KEY_PRIMARY", "").strip()
    openai_api_key_secondary = os.environ.get("OPENAI_API_KEY_SECONDARY", "").strip()
    openai_api_key = openai_api_key_primary if openai_account == "PRIMARY" else openai_api_key_secondary

    # Temporary backward-compatible fallback for the selected account only.
    if not openai_api_key:
        openai_api_key = os.environ.get(
            "OPENAI_API_KEY", ""
        ).strip()

    return _without_retired_make_urls({
        "port": int(os.environ.get("PORT", "3350")),
        "host": os.environ.get("HOST", "127.0.0.1"),
        "log_level": os.environ.get("LOG_LEVEL", "info"),
        "allow_docker_internal": os.environ.get("ALLOW_DOCKER_INTERNAL", "").strip().lower() in {"1", "true", "yes"},
        "public_base_url": os.environ.get("PUBLIC_BASE_URL", "").rstrip("/"),
        "pipeline_runner_shared_secret": os.environ.get("PIPELINE_RUNNER_SHARED_SECRET", ""),
        "airtable_pat": os.environ.get("AIRTABLE_PAT", ""),
        "airtable_base_id": os.environ.get("AIRTABLE_BASE_ID", "appe33zkZn35yirTL"),
        "remotion_renderer_url": os.environ.get("REMOTION_RENDERER_URL", "http://127.0.0.1:3333"),
        "timing_engine_url": os.environ.get("TIMING_ENGINE_URL", "http://127.0.0.1:3336"),
        "voiceover_normalizer_url": os.environ.get("VOICEOVER_NORMALIZER_URL", "http://127.0.0.1:3012"),
        "youtube_uploader_url": os.environ.get("YOUTUBE_UPLOADER_URL", "http://127.0.0.1:3340"),
        "variant_service_url": os.environ.get("VARIANT_SERVICE_URL", ""),
        "variant_service_token": os.environ.get("VARIANT_SERVICE_TOKEN", ""),
        "r2_upload_worker_url": os.environ.get("R2_UPLOAD_WORKER_URL", ""),
        "r2_upload_worker_secret": os.environ.get("R2_UPLOAD_WORKER_SECRET", ""),
        "studio_preview_r2_prefix": os.environ.get("STUDIO_PREVIEW_R2_PREFIX", "studio/previews"),
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "google_client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        "google_refresh_token": os.environ.get("GOOGLE_REFRESH_TOKEN", ""),
        "openai_account": openai_account,
        "openai_api_key": openai_api_key,
        "openai_api_key_primary": openai_api_key_primary,
        "openai_api_key_secondary": openai_api_key_secondary,
        "openai_secondary_provider": os.environ.get("OPENAI_SECONDARY_PROVIDER", "").strip().lower(),
        "openai_secondary_endpoint": os.environ.get("OPENAI_SECONDARY_ENDPOINT", "").strip().rstrip("/"),
        "openai_secondary_api_version": os.environ.get("OPENAI_SECONDARY_API_VERSION", "").strip(),
        "openai_secondary_deployment": os.environ.get("OPENAI_SECONDARY_DEPLOYMENT", "").strip(),
        "openai_r2_model": os.environ.get("OPENAI_R2_MODEL", "gpt-4.1"),
        "openai_p4_model": os.environ.get("OPENAI_P4_MODEL", "gpt-4o"),
        "openai_sai1_model": os.environ.get("OPENAI_SAI1_MODEL", "gpt-5"),
        "p5_webhook_url": os.environ.get("P5_WEBHOOK_URL", ""),
        "p4_email_to": os.environ.get("P4_EMAIL_TO", ""),
        "p5_email_to": os.environ.get("P5_EMAIL_TO", ""),
        "elevenlabs_api_key": os.environ.get("ELEVENLABS_API_KEY", ""),
        "p4_webhook_url": os.environ.get("P4_WEBHOOK_URL", ""),
        "p3_webhook_url": os.environ.get("P3_WEBHOOK_URL", ""),
        "stage_backend_p1": os.environ.get("STAGE_BACKEND_P1", "python").strip().lower(),
        "stage_backend_p2": os.environ.get("STAGE_BACKEND_P2", "python").strip().lower(),
        "stage_backend_p3": os.environ.get("STAGE_BACKEND_P3", "python").strip().lower(),
        "stage_backend_m1": os.environ.get("STAGE_BACKEND_M1", "python").strip().lower(),
        "stage_backend_sai1": os.environ.get("STAGE_BACKEND_SAI1", "python").strip().lower(),
        "stage_backend_c2": os.environ.get("STAGE_BACKEND_C2", "python").strip().lower(),
        "stage_backend_c3": os.environ.get("STAGE_BACKEND_C3", "python").strip().lower(),
        "stage_backend_c3b": os.environ.get("STAGE_BACKEND_C3B", "python").strip().lower(),
        "stage_backend_c4": os.environ.get("STAGE_BACKEND_C4", "python").strip().lower(),
        "stage_backend_c5": os.environ.get("STAGE_BACKEND_C5", "python").strip().lower(),
        "stage_backend_c6": os.environ.get("STAGE_BACKEND_C6", "python").strip().lower(),
        "stage_backend_c7": os.environ.get("STAGE_BACKEND_C7", "python").strip().lower(),
        "stage_backend_c8": os.environ.get("STAGE_BACKEND_C8", "python").strip().lower(),
        "stage_backend_c9": os.environ.get("STAGE_BACKEND_C9", "python").strip().lower(),
        "stage_backend_i1": os.environ.get("STAGE_BACKEND_I1", "python").strip().lower(),
        "stage_backend_i2": os.environ.get("STAGE_BACKEND_I2", "python").strip().lower(),
        "stage_backend_i3": os.environ.get("STAGE_BACKEND_I3", "python").strip().lower(),
        "stage_backend_i4": os.environ.get("STAGE_BACKEND_I4", "python").strip().lower(),
        "stage_backend_a2": os.environ.get("STAGE_BACKEND_A2", "python").strip().lower(),
        "stage_backend_a2b": os.environ.get("STAGE_BACKEND_A2B", "python").strip().lower(),
        "stage_backend_a3": os.environ.get("STAGE_BACKEND_A3", "python").strip().lower(),
        "stage_backend_a4": os.environ.get("STAGE_BACKEND_A4", "python").strip().lower(),
        "stage_backend_a1p": os.environ.get("STAGE_BACKEND_A1P", "python").strip().lower(),
        "stage_backend_a1s": os.environ.get("STAGE_BACKEND_A1S", "python").strip().lower(),
        "stage_backend_ap0": os.environ.get("STAGE_BACKEND_AP0", "python").strip().lower(),
        "stage_backend_ap1_ig": os.environ.get("STAGE_BACKEND_AP1_IG", "python").strip().lower(),
        "stage_backend_ap1_igs": os.environ.get("STAGE_BACKEND_AP1_IGS", "python").strip().lower(),
        "stage_backend_fbs1": os.environ.get("STAGE_BACKEND_FBS1", "python").strip().lower(),
        "stage_backend_fbs3": os.environ.get("STAGE_BACKEND_FBS3", "python").strip().lower(),
        "stage_backend_yt0": os.environ.get("STAGE_BACKEND_YT0", "python").strip().lower(),
        "stage_backend_ttd0": os.environ.get("STAGE_BACKEND_TTD0", "python").strip().lower(),
        "stage_backend_fb0": os.environ.get("STAGE_BACKEND_FB0", "python").strip().lower(),
        "stage_backend_ap0c": os.environ.get("STAGE_BACKEND_AP0C", "python").strip().lower(),
        "stage_backend_ttd_orch": os.environ.get("STAGE_BACKEND_TTD_ORCH", "python").strip().lower(),
        "stage_backend_yt_orch": os.environ.get("STAGE_BACKEND_YT_ORCH", "python").strip().lower(),
        "stage_backend_fb_orch": os.environ.get("STAGE_BACKEND_FB_ORCH", "python").strip().lower(),
        "stage_backend_apcar_orch": os.environ.get("STAGE_BACKEND_APCAR_ORCH", "python").strip().lower(),
        "stage_backend_ig_orch": os.environ.get("STAGE_BACKEND_IG_ORCH", "python").strip().lower(),
        "stage_backend_p0202": os.environ.get("STAGE_BACKEND_P0202", "python").strip().lower(),
        "tiktok_worker_base_url": os.environ.get("TIKTOK_WORKER_BASE_URL", "https://auth.chicagoshining.com").rstrip("/"),
        "tiktok_pipeline_secret": os.environ.get("TIKTOK_PIPELINE_SECRET", ""),
        "a2b_webhook_url": os.environ.get("A2B_WEBHOOK_URL", ""),
        "a3_webhook_url": os.environ.get("A3_WEBHOOK_URL", ""),
        "a4_webhook_url": os.environ.get("A4_WEBHOOK_URL", ""),
        "a1p_webhook_token": os.environ.get("A1P_WEBHOOK_TOKEN", ""),
        "a2_email_to": os.environ.get("A2_EMAIL_TO", ""),
        "openai_a3_model": os.environ.get("OPENAI_A3_MODEL", "gpt-5.5"),
        "openai_i1_model": os.environ.get("OPENAI_I1_MODEL", "gpt-5"),
        "openai_p1_model": os.environ.get("OPENAI_P1_MODEL", "gpt-5"),
        "i2_email_to": os.environ.get("I2_EMAIL_TO", ""),
        "i2_email_enabled": os.environ.get("I2_EMAIL_ENABLED", "false").strip().lower() in {"1", "true", "yes"},
        "i2_webhook_url": os.environ.get("I2_WEBHOOK_URL", ""),
        "i3_webhook_url": os.environ.get("I3_WEBHOOK_URL", ""),
        "i3_webhook_token": os.environ.get("I3_WEBHOOK_TOKEN", ""),
        "i4_webhook_url": os.environ.get("I4_WEBHOOK_URL", ""),
        "c3_email_to": os.environ.get("C3_EMAIL_TO", ""),
        "c3b_webhook_token": os.environ.get("C3B_WEBHOOK_TOKEN", ""),
        "watermark_service_url": os.environ.get("WATERMARK_SERVICE_URL", ""),
        "rr1_review_email_to": os.environ.get("RR1_REVIEW_EMAIL_TO", ""),
        "rr1_decision_webhook_url": os.environ.get("RR1_DECISION_WEBHOOK_URL", ""),
        "rr2_webhook_token": os.environ.get("RR2_WEBHOOK_TOKEN", ""),
        "service_version": os.environ.get("SERVICE_VERSION", "2026-09-18-a3-classify-queue"),
        "ops_alert_email_to": os.environ.get("OPS_ALERT_EMAIL_TO", "chicagoshining@gmail.com"),
        "produce_heal_webhook_url": os.environ.get("PRODUCE_HEAL_WEBHOOK_URL", ""),
    })


@dataclass
class StageRequest:
    output_record_id: str | None = None
    content_item_record_id: str | None = None
    production_request_record_id: str | None = None
    platform_output_id: str | None = None
    test_run_id: str | None = None
    intended_stage: str | None = None
    attempt_number: int | None = None
    idempotency_key: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> StageRequest:
        payload = payload or {}
        known = {
            "output_record_id",
            "content_item_record_id",
            "production_request_record_id",
            "platform_output_id",
            "test_run_id",
            "intended_stage",
            "attempt_number",
            "idempotency_key",
        }
        fields = {key: payload.get(key) for key in known if key in payload}
        nested_extra = payload.get("extra")
        if isinstance(nested_extra, dict):
            extra = dict(nested_extra)
            for key, value in payload.items():
                if key not in known and key != "extra":
                    extra[key] = value
        else:
            extra = {key: value for key, value in payload.items() if key not in known}
        return cls(extra=extra, **fields)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        extra = data.pop("extra", {})
        data = {key: value for key, value in data.items() if value is not None}
        if extra:
            data["extra"] = extra
        return data


@dataclass
class StageResult:
    stage: str
    status: StageStatus
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
