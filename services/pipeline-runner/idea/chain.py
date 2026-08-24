"""Daisy-chain I2/I3/I4 to Python or the live Make webhooks."""

from __future__ import annotations

from typing import Any, Callable

import requests

from config import load_settings
from idea.constants import MAKE_I2_WEBHOOK_URL, MAKE_I3_WEBHOOK_URL, MAKE_I4_WEBHOOK_URL

MAKE_WEBHOOK_FOR_STAGE = {
    "i2": ("i2_webhook_url", MAKE_I2_WEBHOOK_URL),
    "i3": ("i3_webhook_url", MAKE_I3_WEBHOOK_URL),
    "i4": ("i4_webhook_url", MAKE_I4_WEBHOOK_URL),
}


def stage_is_python(stage: str) -> bool:
    settings = load_settings()
    return str(settings.get(f"stage_backend_{stage}") or "make").strip().lower() == "python"


def trigger_next(
    stage: str,
    payload: dict[str, Any],
    *,
    python_call: Callable[[], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if stage_is_python(stage) and python_call is not None:
        result = python_call()
        return {"backend": "python", "stage": stage, **result}

    env_key, fallback = MAKE_WEBHOOK_FOR_STAGE.get(stage, ("", ""))
    settings = load_settings()
    url = str(settings.get(env_key) or fallback or "").strip()
    if not url:
        return {"backend": "make", "stage": stage, "skipped": "missing_webhook"}
    response = requests.get(
        url,
        params=payload,
        headers={"Accept": "text/html, application/json"},
        timeout=40,
    )
    return {
        "backend": "make",
        "stage": stage,
        "status_code": response.status_code,
        "body": (response.text or "")[:300],
    }
