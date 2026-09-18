from __future__ import annotations

import logging
import threading

from a3.constants import MAKE_SCENARIO_ID
from a3.processor import normalize_record_ids, process_request
from asset.helpers import as_bool
from config import StageRequest, StageResult
from stages._carousel import run_named_stage

logger = logging.getLogger(__name__)

# Studio "Classify all" fires A3 in the background. One drain at a time: a second
# click while the first is still classifying would double-bill OpenAI for the same rows.
# Extra clicks enqueue those record IDs so they still run after the current batch.
_BACKGROUND_LOCK = threading.Lock()
_BACKGROUND_THREAD: threading.Thread | None = None
_QUEUED_IDS: list[str] = []
_ACTIVE_IDS: list[str] = []


def background_running() -> bool:
    thread = _BACKGROUND_THREAD
    return bool(thread and thread.is_alive())


def _extend_unique(dest: list[str], incoming: list[str]) -> None:
    seen = set(dest)
    for record_id in incoming:
        if record_id in seen:
            continue
        dest.append(record_id)
        seen.add(record_id)


def _run_background(kwargs: dict) -> None:
    global _ACTIVE_IDS
    try:
        while True:
            with _BACKGROUND_LOCK:
                _ACTIVE_IDS = list(normalize_record_ids(kwargs.get("record_ids")))
            result = process_request(**kwargs)
            logger.info(
                "A3 background classify finished classified=%s passes=%s",
                result.get("classified_count"),
                result.get("classify_passes"),
            )
            with _BACKGROUND_LOCK:
                queued = list(_QUEUED_IDS)
                _QUEUED_IDS.clear()
                _ACTIVE_IDS = list(queued)
            if not queued:
                break
            kwargs = {**kwargs, "record_ids": queued}
            logger.info("A3 background classify continuing with %s queued assets", len(queued))
    except Exception:
        logger.exception("A3 background classify crashed")
    finally:
        with _BACKGROUND_LOCK:
            _ACTIVE_IDS = []


def start_background(kwargs: dict) -> StageResult:
    global _BACKGROUND_THREAD, _ACTIVE_IDS
    requested = normalize_record_ids(kwargs.get("record_ids"))
    count = len(requested) if requested else None
    with _BACKGROUND_LOCK:
        if background_running():
            extra = [record_id for record_id in requested if record_id not in _ACTIVE_IDS and record_id not in _QUEUED_IDS]
            _extend_unique(_QUEUED_IDS, extra)
            return StageResult(
                stage="a3",
                status="skipped",
                message="A3 is already classifying in the background (already_running)",
                details={
                    "make_scenario_id": MAKE_SCENARIO_ID,
                    "background": True,
                    "already_running": True,
                    "queued": len(requested),
                    "queued_total": len(_QUEUED_IDS),
                },
            )
        if requested:
            kwargs = {**kwargs, "record_ids": requested}
        _ACTIVE_IDS = list(requested)
        _BACKGROUND_THREAD = threading.Thread(
            target=_run_background,
            kwargs={"kwargs": kwargs},
            daemon=True,
            name="a3-background-classify",
        )
        _BACKGROUND_THREAD.start()
    return StageResult(
        stage="a3",
        status="ok",
        message=f"A3 classifying {count} assets in background" if count is not None else "A3 classifying in background",
        details={"make_scenario_id": MAKE_SCENARIO_ID, "background": True, "requested_count": count},
    )


def run(request: StageRequest):
    extra = request.extra or {}
    kwargs = {
        "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
        "dry_run": as_bool(extra.get("dry_run")),
        "trigger_a4": extra.get("trigger_a4") is not False,
        "wait_for_next": extra.get("wait_for_next") is not False,
        "max_records": extra.get("max_records"),
        "drain": as_bool(extra.get("drain")),
        "record_ids": extra.get("record_ids") or extra.get("record_id"),
    }
    if as_bool(extra.get("background")) and not kwargs["dry_run"]:
        return start_background(kwargs)
    return run_named_stage(
        "a3",
        request,
        make_id=MAKE_SCENARIO_ID,
        process=process_request,
        kwargs=kwargs,
        skip_message="A3 did not classify media assets",
        ok_message="A3 classified {classified_count} assets",
        dry_run_message="A3 dry-run preview (no OpenAI or Airtable writes)",
    )
