from __future__ import annotations

from airtable.client import AirtableClient
from config import StageRequest, StageResult, load_settings
from item4.clip_poster import ensure_request_clip_posters


def run(request: StageRequest) -> StageResult:
    record_id = str(request.production_request_record_id or "").strip()
    extra = request.extra or {}
    source_asset_id = str(extra.get("source_asset_id") or extra.get("asset_id") or "").strip()
    if not record_id.startswith("rec"):
        return StageResult(
            stage="clip_poster",
            status="error",
            message="production_request_record_id is required",
        )
    try:
        result = ensure_request_clip_posters(
            AirtableClient(),
            record_id,
            source_asset_id=source_asset_id,
        )
    except ValueError as exc:
        return StageResult(stage="clip_poster", status="error", message=str(exc))
    except Exception as exc:
        return StageResult(stage="clip_poster", status="error", message=str(exc))

    ready = bool(result.get("already_ready") or result.get("posters"))
    settings = load_settings()
    return StageResult(
        stage="clip_poster",
        status="ok" if ready else "skipped",
        message="Clip poster ready" if ready else "No clip poster written",
        details={**result, "service_version": settings["service_version"]},
    )
