"""Strict opt-in C5/C6 dispatcher: one held native-gallery job per sweep.

Only an explicitly enabled Windows Runner launches this daemon. The Worker
owns the durable exact claim and launch; Runner never retries a consumed or
ambiguous attempt. On any unexpected failure the daemon stops until an
operator reconciles/explicitly restarts the Runner. No publishing or scheduling.
"""
from __future__ import annotations

import logging
import os
import threading
import time

from airtable.client import AirtableClient
from carousel.image_gen import generate_carousel_png
from integrations.google_drive import GoogleDriveClient
from rendering_review.native_gallery_c5c6_executor import execute_one_native_gallery
from rendering_review.native_gallery_rights_policy import build_approved_native_gallery_clearance
from rendering_review.native_gallery_staging_settings import resolve_private_native_gallery_staging_folder

_LOG = logging.getLogger("pipeline-runner.native-gallery-dispatch")
_LOCK = threading.Lock()
_STARTED = False
_BLOCKED = False
_STATUS = {"last_result": "not_started", "last_job_id": None,
           "requires_reconciliation": False}


def enabled():
    return (os.environ.get("NATIVE_GALLERY_AUTO_EXECUTE_ENABLED") == "true" and
            os.environ.get("NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED") == "true" and
            os.environ.get("NATIVE_GALLERY_RUNNER_CLAIM_ENABLED") == "true" and
            os.environ.get("NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED") == "true")


def snapshot():
    with _LOCK:
        return {"enabled": enabled(), "started": _STARTED,
                "blocked": _BLOCKED, **_STATUS}


def sweep_once(settings, *, client=None, drive=None, executor=execute_one_native_gallery,
               rights_factory=build_approved_native_gallery_clearance):
    """Fail closed before claiming if configuration and rights are incomplete."""
    if not enabled():
        return {"ok": False, "status": "disabled"}
    with _LOCK:
        if _BLOCKED:
            return {"ok": False, "status": "operator_reconciliation_required"}
    rights = rights_factory(settings)
    account = getattr(rights, "preferred_account", None)
    if account not in ("PRIMARY", "SECONDARY"):
        raise RuntimeError("native_gallery_provider_pin_unverified")
    def pinned(prompt, *, ratio):
        return generate_carousel_png(
            prompt, ratio=ratio, preferred_account=account,
            settings_override=dict(settings))
    live_client = client if client is not None else AirtableClient(settings)
    live_drive = drive if drive is not None else GoogleDriveClient()
    folder = resolve_private_native_gallery_staging_folder(live_client, live_drive)
    result = executor(
        client=live_client, drive=live_drive,
        worker_base=os.environ.get("NATIVE_GALLERY_WORKER_BASE_URL", ""),
        shared_secret=os.environ.get("NATIVE_GALLERY_JOB_SHARED_SECRET", ""),
        consumer_identity=os.environ.get("NATIVE_GALLERY_RUNNER_CONSUMER_ID", ""),
        staging_folder_id=folder,
        rights_clearance=rights, generator=pinned)
    if not isinstance(result, dict) or result.get("ok") is not True or (
        result.get("publication_authorized") is not False
    ):
        raise RuntimeError("native_gallery_dispatch_receipt_invalid")
    with _LOCK:
        _STATUS["last_job_id"] = result.get("job_id")
        _STATUS["last_result"] = ("ready_for_review"
                                  if result.get("claimed") else "no_queued_job")
    return result


def _consume(settings):
    global _BLOCKED
    time.sleep(5)
    while enabled():
        try:
            sweep_once(settings)
        except Exception:
            # An exception could follow external generation or an ambiguous
            # Airtable/Drive write. Never automatically attempt the same job.
            with _LOCK:
                _BLOCKED = True
                _STATUS["last_result"] = "operator_reconciliation_required"
                _STATUS["requires_reconciliation"] = True
            _LOG.exception("native_gallery_dispatch_stopped_for_reconciliation")
            return
        time.sleep(30)


def start_consumer(settings):
    global _STARTED
    if not enabled():
        return
    # Fail startup before an async thread can claim anything under an
    # unapproved rights policy or missing immutable server configuration.
    rights = build_approved_native_gallery_clearance(settings)
    if getattr(rights, "preferred_account", None) not in ("PRIMARY", "SECONDARY"):
        raise RuntimeError("native_gallery_auto_rights_provider_unverified")
    if any(not os.environ.get(k, "").strip() for k in (
        "NATIVE_GALLERY_WORKER_BASE_URL", "NATIVE_GALLERY_JOB_SHARED_SECRET",
        "NATIVE_GALLERY_RUNNER_CONSUMER_ID"
    )):
        raise RuntimeError("native_gallery_auto_configuration_missing")
    # Independent Airtable and private Drive check before starting any consumer.
    resolve_private_native_gallery_staging_folder(AirtableClient(settings), GoogleDriveClient())
    with _LOCK:
        if _STARTED or _BLOCKED:
            return
        thread = threading.Thread(target=_consume, args=(dict(settings),),
                                  daemon=True, name="native-gallery-c5c6")
        thread.start()
        _STARTED = True
