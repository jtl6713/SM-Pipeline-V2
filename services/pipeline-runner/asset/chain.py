"""Daisy-chain A2B/A3/A4 to Python or the live Make webhooks."""

from __future__ import annotations

import threading
from typing import Any, Callable

from carousel.timeutil import chicago_now


def stage_is_python(stage: str) -> bool:
    return True


def daisy_payload(stage: str) -> dict[str, str]:
    stamp = chicago_now().strftime("%Y%m%d-%H%M%S")
    return {
        "make08_cycle_id": f"{stamp}-daisy",
        "make08_owner": "daisy-chain",
        "make08_stage": stage.upper(),
    }


def trigger_next(
    stage: str,
    payload: dict[str, Any] | None = None,
    *,
    python_call: Callable[[], dict[str, Any]] | None = None,
    wait: bool = True,
) -> dict[str, Any]:
    params = dict(payload or daisy_payload(stage))
    if stage_is_python(stage) and python_call is not None:
        if wait:
            result = python_call()
            return {"backend": "python", "stage": stage, **result}
        thread = threading.Thread(target=python_call, daemon=True, name=f"asset-chain-{stage}")
        thread.start()
        return {"backend": "python", "stage": stage, "async": True}

    return {"backend": "python", "stage": stage, "skipped": "make_retired"}
