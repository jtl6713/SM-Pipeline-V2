from __future__ import annotations

import logging
import threading

from config import StageRequest, StageResult, load_settings
from item4.formulas import smv1_exact_request_formula
from item4.processor import process_drain
from studio_produce.workload_governor import AdmissionDeferred


logger = logging.getLogger("pipeline-runner.smv1")
_VIBE_MASTER_RUNNING: set[str] = set()
_VIBE_MASTER_LOCK = threading.Lock()


def _async_vibe_master_drain(request_id: str) -> None:
    try:
        # Existing SMV1 selector remains the transfer authority: exact request,
        # Pending row and durable Supabase attempt stamps. No new upload sessions.
        process_drain(production_request_record_id=request_id, max_followup=1)
    except Exception:
        logger.exception("Async Vibe master authority failed request=%s", request_id)
    finally:
        with _VIBE_MASTER_LOCK:
            _VIBE_MASTER_RUNNING.discard(request_id)


def run(request: StageRequest) -> StageResult:
    """
    SMV1 — drain Studio Media Transfer Queue rows on the Python runner.

    Pending platform variants for the same photo share one Drive download.
    Up to eight photos crop in parallel; ratios within a photo also parallelize.
    Crop rows are drained before preview uploads so Ready+Preview cannot starve
    Frames progress.
    """
    production_request_record_id = request.production_request_record_id
    test_run_id = (request.test_run_id or "").strip() or None

    if not production_request_record_id and not request.output_record_id:
        return StageResult(
            stage="smv1",
            status="error",
            message="production_request_record_id is required for pinned SMV1 drains",
        )

    # A multi-hundred-MB Vibe source can take minutes to copy and watermark.
    # The Worker must not hold an HTTP request open across the full transfer.
    if request.extra.get("async_master_recovery") is True:
        if not production_request_record_id or test_run_id:
            return StageResult(stage="smv1", status="error", message="Exact production request required")
        with _VIBE_MASTER_LOCK:
            already = production_request_record_id in _VIBE_MASTER_RUNNING
            if not already:
                _VIBE_MASTER_RUNNING.add(production_request_record_id)
        if not already:
            try:
                threading.Thread(
                    target=_async_vibe_master_drain,
                    args=(production_request_record_id,),
                    daemon=True,
                    name=f"smv1-vibe-{production_request_record_id}",
                ).start()
            except Exception:
                with _VIBE_MASTER_LOCK:
                    _VIBE_MASTER_RUNNING.discard(production_request_record_id)
                raise
        return StageResult(
            stage="smv1", status="deferred",
            message="Existing Vibe master transfer accepted for background recovery",
            details={"already_running": already, "production_request_record_id": production_request_record_id},
        )

    settings = load_settings()
    max_runs = 1
    if isinstance(request.extra.get("max_runs"), int):
        max_runs = max(1, min(int(request.extra["max_runs"]), 20))
    photo_workers = 8
    if isinstance(request.extra.get("photo_workers"), int):
        photo_workers = max(1, min(int(request.extra["photo_workers"]), 10))

    try:
        result = process_drain(
            production_request_record_id=production_request_record_id,
            test_run_id=test_run_id,
            photo_workers=photo_workers,
            max_followup=max_runs,
        )
    except AdmissionDeferred as exc:
        return StageResult(
            stage="smv1", status="deferred",
            message=str(exc),
            details={"reason": "governor_admission_deferred", "processed_count": 0},
        )
    except Exception as exc:
        return StageResult(
            stage="smv1",
            status="error",
            message=str(exc),
            details={
                "make_scenario_id": 5894885,
                "production_request_record_id": production_request_record_id,
                "test_run_id": test_run_id,
            },
        )

    processed_count = int(result.get("processed_count") or 0)
    if processed_count == 0:
        return StageResult(
            stage="smv1",
            status="skipped",
            message="No eligible queue rows matched the SMV1 selector",
            details={
                "make_scenario_id": 5894885,
                "selector_formula": (
                    smv1_exact_request_formula(production_request_record_id, test_run_id or "")
                    if production_request_record_id
                    else None
                ),
                "runs": [result],
            },
        )

    return StageResult(
        stage="smv1",
        status="ok",
        message=f"Processed {processed_count} SMV1 queue row(s)",
        details={
            "make_scenario_id": 5894885,
            "production_request_record_id": production_request_record_id,
            "test_run_id": test_run_id,
            "processed_count": processed_count,
            "photo_groups": result.get("photo_groups"),
            "runs": [result],
            "service_version": settings["service_version"],
        },
    )
