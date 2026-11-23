from __future__ import annotations

import logging
import random
import threading
import time
from typing import Any

from airtable.client import AirtableClient
from studio_produce.constants import STEP_LABELS, TERMINAL_STEPS
from studio_produce import workload_governor as governor
from studio_produce import global_coordinator
from studio_produce.context import load_outputs, load_parent, load_request, load_slides, read_job, write_job, write_job_if_changed
from studio_produce.job import derive_route, is_finished_route, job_is_terminal, new_job, next_step, utc_now, with_step
from studio_produce.steps import STEP_HANDLERS, StepBlocked, StepWait, pick_resume_step, render_progress_detail
from vibe_cut import is_vibe_cut_notes

logger = logging.getLogger("pipeline-runner.studio-produce")

_RUNNING: set[str] = set()
_LOCK = threading.Lock()
MAX_WALL_SECONDS = 12 * 60
MAX_LOOPS = 200
MAX_ATTEMPTS = 24
WAIT_BACKOFF_SECONDS = (5, 15, 30, 60)


def wait_interval(streak: int, *, jitter: float | None = None) -> float:
    """Bounded adaptive delay with 0-10 percent stagger across simultaneous jobs."""
    base = WAIT_BACKOFF_SECONDS[min(max(1, streak) - 1, len(WAIT_BACKOFF_SECONDS) - 1)]
    spread = random.uniform(0, 0.10) if jitter is None else max(0.0, min(0.10, jitter))
    return base * (1.0 + spread)



def start_job(
    production_request_record_id: str, *, resume: bool = False, _governed_prepare: bool = False,
) -> dict[str, Any]:
    request_id = str(production_request_record_id or "").strip()
    if not request_id.startswith("rec"):
        raise ValueError("production_request_record_id is required")
    if governor.enabled() and not _governed_prepare:
        # No canonical write is permitted before the durable producer claim.
        # This read-only preflight preserves the existing terminal rejection.
        governor.database_path()
        if governor.circuit_open():
            created = _launch(request_id, resume=resume)
            return {
                "accepted": True, "already_running": not created,
                "queued": True, "deferred_due_to_database_circuit": True,
                "job": {}, "production_request_record_id": request_id,
            }
        request = load_request(AirtableClient(), request_id)
        job = read_job(request)
        fields = request.get("fields") or {}
        notes = " ".join(str(fields.get(name) or "") for name in (
            "Production_Notes", "Production_Request_Notes",
            "Production_Config_Notes", "Output_Notes",
        ))
        vibe = is_vibe_cut_notes(notes)
        if job_is_terminal(job) and not resume and not (
            vibe and is_finished_route(str(job.get("route") or ""))
        ):
            return {
                "accepted": False, "reason": "terminal", "job": job,
                "production_request_record_id": request_id,
            }
        created = _launch(request_id, resume=resume)
        return {
            "accepted": True, "already_running": not created, "queued": True,
            "job": job, "production_request_record_id": request_id,
        }
    client = AirtableClient()
    request = load_request(client, request_id)
    parent = load_parent(client, request)
    outputs = load_outputs(client, request_id, parent)
    job = read_job(request)
    fields = request.get("fields") or {}
    notes = " ".join(
        str(fields.get(name) or "")
        for name in ("Production_Notes", "Production_Request_Notes", "Production_Config_Notes", "Output_Notes")
    )
    vibe_cut = is_vibe_cut_notes(notes)
    if job_is_terminal(job) and not resume and not (
        vibe_cut and is_finished_route(str((job or {}).get("route") or ""))
    ):
        return {"accepted": False, "reason": "terminal", "job": job, "production_request_record_id": request_id}
    if not job or not job.get("job_id"):
        route = derive_route(fields, outputs)
        job = new_job(route=route, step="themes")
        write_job(client, request_id, job)
    elif vibe_cut and is_finished_route(str(job.get("route") or "")):
        # Older Workers mis-classified single-master Vibe Cuts as finished passthrough.
        route = derive_route(fields, outputs)
        heal = dict(job.get("heal") or {}) if isinstance(job.get("heal"), dict) else {}
        heal["vibe_cut_passthrough_cleared_at"] = utc_now()
        heal["resume_count"] = 0
        job = with_step(
            {**job, "route": route, "error": None, "heal": heal},
            "themes",
            error=None,
        )
        write_job(client, request_id, job)
    elif resume and job_is_terminal(job):
        route = job.get("route") or derive_route(fields, outputs)
        if vibe_cut and is_finished_route(str(route or "")):
            route = derive_route(fields, outputs)
        step = pick_resume_step(request, outputs, parent=parent, route=route)
        heal = dict(job.get("heal") or {}) if isinstance(job.get("heal"), dict) else {}
        # Manual/agent resume after escalate clears the escalation latch but keeps history.
        if str(job.get("step") or "") == "escalated":
            heal["escalated_at"] = None
            heal["cleared_at"] = utc_now()
        job = with_step({**job, "route": route, "error": None, "heal": heal}, step, error=None)
        job["error"] = None
        write_job(client, request_id, job)
    elif not job.get("route"):
        job = {**job, "route": derive_route(fields, outputs)}
        write_job(client, request_id, job)
    if _governed_prepare:
        return {
            "accepted": True, "prepared": True, "job": job,
            "production_request_record_id": request_id,
        }
    launched = _launch(request_id)
    return {
        "accepted": True,
        "already_running": not launched,
        "job": job,
        "production_request_record_id": request_id,
    }


def resume_job(production_request_record_id: str) -> dict[str, Any]:
    return start_job(production_request_record_id, resume=True)


def _launch(request_id: str, *, resume: bool = False) -> bool:
    if governor.enabled():
        created = governor.enqueue(request_id, resume=resume)
        governor.ensure_dispatcher(_run_governed)
        return created
    with _LOCK:
        if request_id in _RUNNING:
            return False
        _RUNNING.add(request_id)
    thread = threading.Thread(target=_run_safe, args=(request_id,), daemon=True, name=f"studio-produce-{request_id}")
    thread.start()
    return True


def _run_governed(request_id: str, token: str) -> None:
    """Locally claimed producer; optionally require a second cross-host fence."""
    requeue = False
    progressed = False
    try:
        if not governor.job_valid(request_id, token):
            return
        # Global coordination is OFF unless explicitly activated on the
        # Windows service. Denied or unconfirmed RPC never prepares a job.
        with global_coordinator.producer_lease(request_id) as global_guard:
            with governor.job_heartbeat(request_id, token) as stopped:
                if not governor.job_valid(request_id, token) or global_guard.lost.is_set():
                    requeue = True
                    return
                resume_requested = governor.claimed_resume_requested(request_id, token)
                prepared = start_job(request_id, resume=resume_requested, _governed_prepare=True)
                if not prepared.get("accepted"):
                    return
                outcome = _run(
                    request_id, lease_token=token, heartbeat_stopped=stopped,
                    global_lease_stopped=global_guard.lost,
                )
                requeue = outcome in {"yielded", "yielded_progressed"}
                progressed = outcome in {"yielded_progressed", "completed_progressed"}
                if global_guard.lost.is_set():
                    # Never claim global recovery success after a lost fence.
                    requeue = True
                    progressed = False
                elif progressed:
                    global_guard.mark_progress()
    except Exception as error:
        if isinstance(error, (governor.AdmissionDeferred,
                              global_coordinator.GlobalAdmissionUnavailable)):
            logger.info("studio producer deferred by local/global workload admission")
            requeue = True
        elif governor.is_database_overload(error) or governor.circuit_open():
            logger.warning("studio producer requeued on database outage request=%s", request_id)
            governor.trip_database_circuit()
            requeue = True
        else:
            logger.exception("studio governed producer crashed request=%s", request_id)
            try:
                if not governor.job_valid(request_id, token):
                    # Another owner may already have reclaimed this lease.
                    # Never write its job state from the stale worker.
                    return
                client = AirtableClient()
                request = load_request(client, request_id)
                write_job(client, request_id, with_step(read_job(request), "blocked", error="Studio production job crashed"))
            except Exception:
                logger.exception("unable to persist governed producer failure; retaining job request=%s", request_id)
                requeue = True
    finally:
        governor.finish_job(request_id, token, requeue=requeue, progressed=progressed)


def _run_safe(request_id: str) -> None:
    try:
        _run(request_id)
    except Exception:
        logger.exception("studio produce job crashed request=%s", request_id)
        try:
            client = AirtableClient()
            request = load_request(client, request_id)
            job = with_step(read_job(request), "blocked", error="Studio production job crashed")
            write_job(client, request_id, job)
        except Exception:
            logger.exception("studio produce failed to persist crash request=%s", request_id)
    finally:
        with _LOCK:
            _RUNNING.discard(request_id)


def _run(
    request_id: str, *, lease_token: str | None = None,
    heartbeat_stopped: threading.Event | None = None,
    global_lease_stopped: threading.Event | None = None,
) -> str | None:
    client = AirtableClient()
    started = time.monotonic()
    advanced = False
    wait_streak = 0
    last_step = None
    for _ in range(MAX_LOOPS):
        if lease_token and (
            (heartbeat_stopped is not None and heartbeat_stopped.is_set())
            or (global_lease_stopped is not None and global_lease_stopped.is_set())
            or not governor.job_valid(request_id, lease_token)
            or governor.circuit_open()
        ):
            return "yielded_progressed" if advanced else "yielded"
        if time.monotonic() - started >= MAX_WALL_SECONDS:
            logger.info("studio produce yielding request=%s after wall clock", request_id)
            return "yielded_progressed" if advanced else "yielded"
        request = load_request(client, request_id)
        parent = load_parent(client, request)
        outputs = load_outputs(client, request_id, parent)
        job = read_job(request)
        step = str(job.get("step") or "themes").strip()
        if step != last_step:
            wait_streak = 0
            last_step = step
        if step in TERMINAL_STEPS:
            return "completed_progressed" if advanced else None
        if int(job.get("attempt") or 1) > MAX_ATTEMPTS:
            write_job(client, request_id, with_step(job, "blocked", error=f"Step {step} exceeded {MAX_ATTEMPTS} attempts"))
            return
        # Avoid writing a timestamp-only state on each handler invocation.
        job = with_step(job, step, detail=job.get("detail") or STEP_LABELS.get(step, step), bump_attempt=False)
        handler = STEP_HANDLERS.get(step)
        if not handler:
            write_job(client, request_id, with_step(job, "blocked", error=f"Unknown step {step}"))
            return
        ctx = {
            "request_id": request_id,
            "request": request,
            "parent": parent,
            "outputs": outputs,
            "slides": load_slides(client, parent),
            "job": job,
        }
        try:
            nxt = handler(client, ctx)
        except StepWait as exc:
            write_job_if_changed(client, request_id, read_job(request), with_step(job, step, detail=str(exc.detail), bump_attempt=False))
            wait_streak += 1
            time.sleep(wait_interval(wait_streak))
            continue
        except StepBlocked as exc:
            write_job(client, request_id, with_step(job, "blocked", error=str(exc)))
            return
        except Exception as exc:
            if governor.enabled() and (
                isinstance(exc, governor.AdmissionDeferred) or governor.is_database_overload(exc) or governor.circuit_open()
            ):
                # Do not persist a terminal Blocked status on a 522/timeout.
                # Leave the job claimed until the governed worker safely requeues.
                raise
            from studio_produce.steps import _is_transient_render_error

            if step == "render" and _is_transient_render_error(exc):
                logger.warning(
                    "studio produce render transient request=%s error=%s",
                    request_id,
                    exc,
                )
                write_job_if_changed(
                    client, request_id, read_job(request),
                    with_step(job, "render", detail=render_progress_detail(ctx.get("outputs") or outputs), bump_attempt=False),
                )
                wait_streak += 1
                time.sleep(wait_interval(wait_streak))
                continue
            logger.exception("studio produce step failed request=%s step=%s", request_id, step)
            write_job(client, request_id, with_step(job, "blocked", error=str(exc)))
            return
        # A remote lease can be fenced while a long handler runs. Before
        # persisting its next step, require that global ownership remains live.
        if global_lease_stopped is not None and global_lease_stopped.is_set():
            return "yielded_progressed" if advanced else "yielded"
        nxt = nxt or next_step(step)
        if nxt != step:
            advanced = True
        next_job = with_step(job, nxt)
        if nxt == "done" and isinstance(next_job.get("heal"), dict):
            heal = dict(next_job["heal"])
            heal["resolved_at"] = utc_now()
            heal["resume_count"] = 0
            heal["escalated_at"] = None
            next_job["heal"] = heal
        write_job(client, request_id, next_job)
        if nxt in TERMINAL_STEPS:
            return "completed_progressed" if advanced else None
    return "yielded_progressed" if advanced else "yielded"

# Restore queued work when the Windows runner restarts (no provider publishing).
# Misconfigured durable storage must not take read-only Studio endpoints offline.
if governor.enabled():
    try:
        governor.ensure_dispatcher(_run_governed)
    except Exception:
        logger.exception("governed producer admission disabled: durable store unavailable")
