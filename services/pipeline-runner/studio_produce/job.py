from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from studio_produce.constants import (
    JOB_SCHEMA,
    NATIVE_OUTPUT_TYPES,
    REEL_OUTPUT_TYPES,
    STEP_LABELS,
    STEP_PERCENT,
    STEPS,
    STORY_OUTPUT_TYPES,
    TERMINAL_STEPS,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_json(raw: Any, default: Any) -> Any:
    if isinstance(raw, (dict, list)):
        return raw
    text = str(raw or "").strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


def parse_job(raw: Any) -> dict[str, Any]:
    data = parse_json(raw, {})
    if not isinstance(data, dict):
        return {}
    return data


def new_job(*, route: str, step: str = "themes") -> dict[str, Any]:
    return {
        "schema_version": JOB_SCHEMA,
        "job_id": f"spj-{uuid.uuid4().hex[:12]}",
        "route": route,
        "step": step,
        "attempt": 1,
        "updated_at": utc_now(),
        "error": None,
        "detail": STEP_LABELS.get(step, step),
        "percent": STEP_PERCENT.get(step, 5),
    }


def with_step(
    job: dict[str, Any],
    step: str,
    *,
    error: str | None = None,
    detail: str | None = None,
    bump_attempt: bool = True,
) -> dict[str, Any]:
    next_job = dict(job or {})
    next_job["schema_version"] = JOB_SCHEMA
    next_job["job_id"] = next_job.get("job_id") or f"spj-{uuid.uuid4().hex[:12]}"
    next_job["step"] = step
    if step != job.get("step"):
        next_job["attempt"] = 1
    elif bump_attempt:
        next_job["attempt"] = int(next_job.get("attempt") or 1) + 1
    else:
        next_job["attempt"] = int(next_job.get("attempt") or 1)
    next_job["updated_at"] = utc_now()
    next_job["error"] = error
    next_job["detail"] = detail or STEP_LABELS.get(step, step)
    next_job["percent"] = STEP_PERCENT.get(step, 5)
    return next_job


def next_step(step: str) -> str:
    if step in TERMINAL_STEPS:
        return step
    try:
        index = STEPS.index(step)
    except ValueError:
        return "themes"
    if index + 1 >= len(STEPS):
        return "done"
    return STEPS[index + 1]


def job_is_terminal(job: dict[str, Any] | None) -> bool:
    return str((job or {}).get("step") or "").strip() in TERMINAL_STEPS


def job_is_stale(job: dict[str, Any] | None, *, now: datetime | None = None, stale_after: int = 180) -> bool:
    if not job or job_is_terminal(job):
        return False
    stamp = str(job.get("updated_at") or "").strip()
    if not stamp:
        return True
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return True
    current = now or datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (current - parsed).total_seconds() >= stale_after


def _output_type(row: dict[str, Any]) -> str:
    fields = row.get("fields") or row
    return str(fields.get("Studio_Output_Type") or fields.get("Platform_Output_Type") or fields.get("Format") or "").strip()


def request_notes(request_fields: dict[str, Any]) -> str:
    return " ".join(
        str(request_fields.get(name) or "")
        for name in ("Production_Notes", "Production_Request_Notes", "Production_Config_Notes", "Output_Notes")
    )


def finished_origin_kind(request_fields: dict[str, Any]) -> str:
    text = request_notes(request_fields).lower()
    if "ez-input=finished-video" in text:
        return "finished-video"
    if "ez-input=finished-stills" in text or "ez-input=finished-carousel" in text:
        return "finished-stills"
    return ""


def is_finished_route(route: str) -> bool:
    return str(route or "").endswith(":passthrough") or str(route or "").startswith("finished-")


def derive_route(request_fields: dict[str, Any], output_rows: list[dict[str, Any]] | None = None) -> str:
    notes = request_notes(request_fields)
    finished = finished_origin_kind(request_fields)
    if finished:
        return f"{finished}:passthrough"
    mode = str(request_fields.get("Carousel_Image_Mode") or "").strip()
    assets = parse_json(request_fields.get("Studio_Master_Assets_JSON"), [])
    uploaded = [item for item in assets if isinstance(item, dict) and item.get("source") != "studio_ai"]
    ai_assets = [item for item in assets if isinstance(item, dict) and item.get("source") == "studio_ai"]
    if "ez-input=mixed" in notes or (uploaded and (ai_assets or "ez-ai=" in notes)):
        source = "mixed"
    elif mode == "Make AI Generated" or "ez-input=multiple-ai" in notes or "ez-input=single-ai" in notes:
        source = "ai"
    else:
        source = "uploaded"

    types = [_output_type(row) for row in (output_rows or [])]
    has_reel = any(item in REEL_OUTPUT_TYPES or item in STORY_OUTPUT_TYPES for item in types)
    has_native = any(item in NATIVE_OUTPUT_TYPES for item in types)
    if has_reel and has_native:
        render = "mixed_outputs"
    elif has_reel or not types:
        render = "photo_sequence"
    elif has_native:
        render = "native_still"
    else:
        render = "photo_sequence"
    return f"{source}:{render}"
