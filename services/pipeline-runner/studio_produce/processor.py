from __future__ import annotations

import logging
import threading
import time
from typing import Any

from airtable.client import AirtableClient
from studio_produce.constants import STEP_LABELS, TERMINAL_STEPS
from studio_produce.context import load_outputs, load_parent, load_request, load_slides, read_job, write_job
from studio_produce.job import derive_route, job_is_terminal, new_job, next_step, with_step
from studio_produce.steps import STEP_HANDLERS, StepBlocked, StepWait, pick_resume_step

logger = logging.getLogger("pipeline-runner.studio-produce")

_RUNNING: set[str] = set()
_LOCK = threading.Lock()
MAX_WALL_SECONDS = 12 * 60
MAX_LOOPS = 200
MAX_ATTEMPTS = 24
WAIT_SECONDS = 2
RENDER_WAIT_SECONDS = 8


def start_job(production_request_record_id: str, *, resume: bool = False) -> dict[str, Any]:
    request_id = str(production_request_record_id or "").strip()
    if not request_id.startswith("rec"):
        raise ValueError("production_request_record_id is required")
    client = AirtableClient()
    request = load_request(client, request_id)
    parent = load_parent(client, request)
    outputs = load_outputs(client, request_id, parent)
    job = read_job(request)
    if job_is_terminal(job) and not resume:
        return {"accepted": False, "reason": "terminal", "job": job, "production_request_record_id": request_id}
    if not job or not job.get("job_id"):
        route = derive_route(request.get("fields") or {}, outputs)
        job = new_job(route=route, step="themes")
        write_job(client, request_id, job)
    elif resume and job_is_terminal(job):
        route = job.get("route") or derive_route(request.get("fields") or {}, outputs)
        step = pick_resume_step(request, outputs)
        job = with_step({**job, "route": route, "error": None}, step, error=None)
        job["error"] = None
        write_job(client, request_id, job)
    elif not job.get("route"):
        job = {**job, "route": derive_route(request.get("fields") or {}, outputs)}
        write_job(client, request_id, job)
    launched = _launch(request_id)
    return {
        "accepted": True,
        "already_running": not launched,
        "job": job,
        "production_request_record_id": request_id,
    }


def resume_job(production_request_record_id: str) -> dict[str, Any]:
    return start_job(production_request_record_id, resume=True)


def _launch(request_id: str) -> bool:
    with _LOCK:
        if request_id in _RUNNING:
            return False
        _RUNNING.add(request_id)
    thread = threading.Thread(target=_run_safe, args=(request_id,), daemon=True, name=f"studio-produce-{request_id}")
    thread.start()
    return True


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


def _run(request_id: str) -> None:
    client = AirtableClient()
    started = time.monotonic()
    for _ in range(MAX_LOOPS):
        if time.monotonic() - started >= MAX_WALL_SECONDS:
            logger.info("studio produce yielding request=%s after wall clock", request_id)
            return
        request = load_request(client, request_id)
        parent = load_parent(client, request)
        outputs = load_outputs(client, request_id, parent)
        job = read_job(request)
        step = str(job.get("step") or "themes").strip()
        if step in TERMINAL_STEPS:
            return
        if int(job.get("attempt") or 1) > MAX_ATTEMPTS:
            write_job(client, request_id, with_step(job, "blocked", error=f"Step {step} exceeded {MAX_ATTEMPTS} attempts"))
            return
        job = with_step(job, step, detail=job.get("detail") or STEP_LABELS.get(step, step), bump_attempt=False)
        write_job(client, request_id, job)
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
            write_job(client, request_id, with_step(job, step, detail=str(exc.detail), bump_attempt=False))
            time.sleep(RENDER_WAIT_SECONDS if step == "render" else WAIT_SECONDS)
            continue
        except StepBlocked as exc:
            write_job(client, request_id, with_step(job, "blocked", error=str(exc)))
            return
        except Exception as exc:
            from studio_produce.steps import _is_transient_render_error

            if step == "render" and _is_transient_render_error(exc):
                logger.warning(
                    "studio produce render transient request=%s error=%s",
                    request_id,
                    exc,
                )
                write_job(
                    client,
                    request_id,
                    with_step(job, "render", detail="Rendering", bump_attempt=False),
                )
                time.sleep(RENDER_WAIT_SECONDS)
                continue
            logger.exception("studio produce step failed request=%s step=%s", request_id, step)
            write_job(client, request_id, with_step(job, "blocked", error=str(exc)))
            return
        nxt = nxt or next_step(step)
        write_job(client, request_id, with_step(job, nxt))
        if nxt in TERMINAL_STEPS:
            return
