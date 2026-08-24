from __future__ import annotations

from collections.abc import Callable
from typing import Any

from config import StageRequest, StageResult, load_settings


def run_named_stage(
    stage: str,
    request: StageRequest,
    *,
    make_id: int,
    process: Callable[..., dict[str, Any]],
    kwargs: dict[str, Any],
    skip_message: str,
    ok_message: str,
    dry_run_message: str,
) -> StageResult:
    settings = load_settings()
    try:
        result = process(**kwargs)
    except Exception as exc:
        return StageResult(
            stage=stage,
            status="error",
            message=str(exc),
            details={"make_scenario_id": make_id},
        )
    if result.get("dry_run"):
        return StageResult(
            stage=stage,
            status="ok",
            message=dry_run_message,
            details={"make_scenario_id": make_id, "dry_run": True, "run": result},
        )
    if not result.get("processed"):
        reason = result.get("reason") or "not_processed"
        return StageResult(
            stage=stage,
            status="skipped",
            message=f"{skip_message} ({reason})",
            details={"make_scenario_id": make_id, "run": result},
        )
    return StageResult(
        stage=stage,
        status="ok",
        message=ok_message.format(**{**result, "stage": stage}),
        details={
            "make_scenario_id": make_id,
            "run": result,
            "service_version": settings["service_version"],
            "themes": result.get("themes"),
        },
    )
