"""Bounded, autonomous dispatch of already-committed Rendering Review jobs.

Airtable is authoritative. Only explicit, immutable, held Chicago V2+ jobs
are eligible; this module NEVER creates a plan, attempt, job or publication.
A durable Retry_Count=1 is written and read back BEFORE the only dispatch
request. Any ambiguous response is for manual reconciliation, not replay.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from datetime import datetime, timezone

import requests

from airtable.client import AirtableClient
from rendering_review.one_job import JOBS
from rendering_review.recovery import require_unlaunched_authority

_LOG = logging.getLogger("pipeline-runner.rendering-review-dispatch")
_RECORD = re.compile(r"rec[A-Za-z0-9]{14}\Z")
_JOB = re.compile(r"rrjob_[A-Za-z0-9_-]{12,110}\Z")
_MIN_AGE = 120
_SCAN_SECONDS = 30
_MAX_SCAN = 10
_LOCK = threading.Lock()
_STARTED = False
_STATE = {
    "last_scan_utc": None, "last_dispatch_utc": None, "last_job_id": None,
    "last_result": "not_started", "last_error_code": None,
    "scanned_count": 0, "eligible_count": 0,
}


def enabled() -> bool:
    return (os.environ.get("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED") == "true"
            and os.environ.get("RENDERING_REVIEW_EXACT_RENDER_ENABLED") == "true")


def snapshot() -> dict:
    with _LOCK:
        return {"enabled": enabled(), "started": _STARTED, **_STATE}


def _update(**fields):
    with _LOCK:
        _STATE.update(fields)


def _age_seconds(row: dict, now: datetime) -> float | None:
    created = str(row.get("createdTime") or "").strip()
    try:
        parsed = datetime.fromisoformat(created.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return (now - parsed.astimezone(timezone.utc)).total_seconds()
    except (ValueError, TypeError):
        return None


def eligible_candidate(row: dict, now: datetime) -> dict | None:
    """Reject young, stale, previously attempted, claimed or malformed jobs."""
    f = row.get("fields") if isinstance(row, dict) else None
    if not isinstance(f, dict) or not _RECORD.fullmatch(str(row.get("id") or "")):
        return None
    job_id, output_id = f.get("Job_ID"), f.get("Output_Record_ID")
    if (not _JOB.fullmatch(str(job_id or "")) or
        not _RECORD.fullmatch(str(output_id or "")) or
        f.get("Job_State") != "queued" or
        f.get("Progress_Stage") != "awaiting_isolated_renderer" or
        f.get("Retry_Count") not in (None, 0, 0.0) or
        f.get("Progress_Percent") not in (None, 0, 0.0) or
        f.get("Lease_Fence") not in (None, 0, 0.0) or
        f.get("Lease_Owner") or
        f.get("Event_History_JSON") != "[]" or
        _age_seconds(row, now) is None or _age_seconds(row, now) < _MIN_AGE):
        return None
    return {"row_id": row["id"], "job_id": job_id, "output_id": output_id}


def sweep_once(*, client=None, now=None, sender=None, authority=None) -> dict:
    """At most one existing job, at most one POST, no automatic replay.

    The persistent attempt marker is deliberately fail-closed. A crash after
    marking but before POST leaves a queued job needing operator attention.
    """
    if not enabled():
        return {"status": "disabled", "dispatched": False}
    now = now or datetime.now(timezone.utc)
    sender = sender or requests.post
    authority = authority or require_unlaunched_authority
    client = client or AirtableClient()
    _update(last_scan_utc=now.isoformat(), last_error_code=None)
    try:
        rows = client.list_records(
            JOBS,
            formula=('AND({Job_State}="queued",{Progress_Stage}="awaiting_isolated_renderer",'
                     'OR({Retry_Count}=0,{Retry_Count}=BLANK()),'
                     'OR({Lease_Fence}=0,{Lease_Fence}=BLANK()),'
                     '{Lease_Owner}="",{Event_History_JSON}="[]")'),
            max_records=_MAX_SCAN,
            fields=["Job_ID", "Output_Record_ID", "Job_State", "Progress_Stage",
                    "Retry_Count", "Progress_Percent", "Lease_Fence", "Lease_Owner",
                    "Event_History_JSON"],
        )
        if not isinstance(rows, list) or len(rows) > _MAX_SCAN:
            raise RuntimeError("queue_scan_invalid")
        eligible = [candidate for row in rows
                    if (candidate := eligible_candidate(row, now)) is not None]
        _update(scanned_count=len(rows), eligible_count=len(eligible))
        if not eligible:
            _update(last_result="no_eligible_job")
            return {"status": "no_eligible_job", "dispatched": False,
                    "scanned": len(rows)}
        selected = eligible[0]
        job_id, output_id = selected["job_id"], selected["output_id"]
        # The same authority check used by the guarded reconcile endpoint:
        # held original, exact saved session+plan+attempt, zero launch history.
        if authority(output_id, job_id, client=client) is not True:
            raise RuntimeError("unlaunched_authority_unverified")
        # Durable fail-closed mark. Do not POST if either PATCH or GET is
        # ambiguous. This existing review-job field does not change attempt
        # identity or lift the publication hold.
        client.update_record(JOBS, selected["row_id"], {"Retry_Count": 1})
        fresh = client.get_record(JOBS, selected["row_id"])
        ff = fresh.get("fields") or {}
        if (fresh.get("id") != selected["row_id"] or
            ff.get("Job_ID") != job_id or ff.get("Output_Record_ID") != output_id or
            ff.get("Retry_Count") != 1 or ff.get("Job_State") != "queued" or
            ff.get("Progress_Stage") != "awaiting_isolated_renderer" or
            ff.get("Lease_Owner") or ff.get("Lease_Fence") not in (None, 0, 0.0)):
            raise RuntimeError("dispatch_marker_readback_failed")
        secret = os.environ.get("PIPELINE_RUNNER_SHARED_SECRET", "").strip()
        if len(secret) < 24:
            raise RuntimeError("runner_auth_missing")
        # Same local protected entrypoint used by Studio and the proven
        # one-time repair, not a direct or duplicated Remotion request.
        response = sender(
            "http://127.0.0.1:3350/jobs/rendering-review/run-exact",
            json={"output_id": output_id, "job_id": job_id},
            headers={"X-Pipeline-Secret": secret},
            timeout=20, allow_redirects=False,
        )
        payload = response.json()
        accepted = (response.status_code == 202 and
                    isinstance(payload, dict) and payload.get("ok") is True and
                    payload.get("accepted") is True and
                    payload.get("job_id") == job_id and
                    payload.get("output_id") == output_id)
        if not accepted:
            raise RuntimeError("runner_dispatch_ack_unverified")
        _update(last_dispatch_utc=datetime.now(timezone.utc).isoformat(),
                last_job_id=job_id, last_result="accepted", last_error_code=None)
        _LOG.info("review_auto_dispatch_accepted job=%s output=%s", job_id, output_id)
        return {"status": "accepted", "dispatched": True, "job_id": job_id}
    except Exception as exc:
        # No automatic second attempt: an HTTP timeout could mean the job
        # was accepted; an Airtable write may have succeeded ambiguously.
        reason = (str(exc) if isinstance(exc, RuntimeError) and
                  re.fullmatch(r"[a-z_]{3,80}", str(exc)) else
                  "dispatch_ambiguous_reconciliation_required")
        _update(last_result="requires_attention", last_error_code=reason)
        _LOG.warning("review_auto_dispatch_requires_attention code=%s", reason)
        return {"status": "requires_attention", "dispatched": False,
                "reason_code": reason}


def _consume() -> None:
    # Begin after Flask is listening, so loopback POST can be acknowledged.
    time.sleep(5)
    while enabled():
        try:
            sweep_once()
        except Exception:
            _LOG.exception("review_auto_dispatch_unexpected_error")
        time.sleep(_SCAN_SECONDS)


def start_consumer() -> None:
    global _STARTED
    if not enabled():
        return
    if len(os.environ.get("PIPELINE_RUNNER_SHARED_SECRET", "").strip()) < 24:
        raise RuntimeError("rendering review auto-dispatch requires Runner authentication")
    with _LOCK:
        if _STARTED:
            return
        thread = threading.Thread(target=_consume, daemon=True,
                                  name="render-review-auto-dispatch")
        thread.start()
        _STARTED = True
