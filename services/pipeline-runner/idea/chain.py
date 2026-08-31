"""Daisy-chain I2/I3/I4 to Python or the live Make webhooks."""

from __future__ import annotations

from typing import Any, Callable


def stage_is_python(stage: str) -> bool:
    return True


def trigger_next(
    stage: str,
    payload: dict[str, Any],
    *,
    python_call: Callable[[], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if stage_is_python(stage) and python_call is not None:
        result = python_call()
        return {"backend": "python", "stage": stage, **result}

    return {"backend": "python", "stage": stage, "skipped": "make_retired"}
