from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


StageStatus = Literal["ok", "skipped", "deferred", "not_implemented", "error"]


@lru_cache
def load_settings() -> dict[str, Any]:
    return {
        "port": int(os.environ.get("PORT", "3350")),
        "host": os.environ.get("HOST", "127.0.0.1"),
        "log_level": os.environ.get("LOG_LEVEL", "info"),
        "public_base_url": os.environ.get("PUBLIC_BASE_URL", "").rstrip("/"),
        "pipeline_runner_shared_secret": os.environ.get("PIPELINE_RUNNER_SHARED_SECRET", ""),
        "airtable_pat": os.environ.get("AIRTABLE_PAT", ""),
        "airtable_base_id": os.environ.get("AIRTABLE_BASE_ID", "appe33zkZn35yirTL"),
        "remotion_renderer_url": os.environ.get("REMOTION_RENDERER_URL", "http://127.0.0.1:3333"),
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
        "openai_api_key": os.environ.get("OPENAI_API_KEY", ""),
        "openai_r2_model": os.environ.get("OPENAI_R2_MODEL", "gpt-4.1"),
        "elevenlabs_api_key": os.environ.get("ELEVENLABS_API_KEY", ""),
        "p4_webhook_url": os.environ.get("P4_WEBHOOK_URL", ""),
        "p3_webhook_url": os.environ.get("P3_WEBHOOK_URL", ""),
        "stage_backend_p3": os.environ.get("STAGE_BACKEND_P3", "make").strip().lower(),
        "rr1_review_email_to": os.environ.get("RR1_REVIEW_EMAIL_TO", ""),
        "rr1_decision_webhook_url": os.environ.get("RR1_DECISION_WEBHOOK_URL", ""),
        "rr2_webhook_token": os.environ.get("RR2_WEBHOOK_TOKEN", ""),
        "service_version": os.environ.get("SERVICE_VERSION", "2026-08-23-native-jpeg-lettering"),
    }


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
