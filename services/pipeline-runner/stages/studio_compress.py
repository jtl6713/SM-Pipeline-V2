from __future__ import annotations

from airtable.client import AirtableClient
from config import StageRequest, StageResult, load_settings
from studio_compress.processor import start_job


def run(request: StageRequest) -> StageResult:
    record_id = str(request.production_request_record_id or "").strip()
    extra = request.extra or {}
    source_asset_id = str(extra.get("source_asset_id") or extra.get("asset_id") or "").strip()
    if not record_id.startswith("rec"):
        return StageResult(
            stage="studio_compress",
            status="error",
            message="production_request_record_id is required",
        )
    try:
        result = start_job(record_id, source_asset_id)
    except ValueError as exc:
        return StageResult(stage="studio_compress", status="error", message=str(exc))
    except Exception as exc:
        return StageResult(stage="studio_compress", status="error", message=str(exc))

    settings = load_settings()
    return StageResult(
        stage="studio_compress",
        status="deferred",
        message="Studio compression started",
        details={**result, "service_version": settings["service_version"]},
    )
