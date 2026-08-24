"""Daisy-chain A2B/A3/A4 to Python or the live Make webhooks."""

from __future__ import annotations

import threading
from typing import Any, Callable

import requests

from asset.constants import MAKE_A2B_WEBHOOK_URL, MAKE_A3_WEBHOOK_URL, MAKE_A4_WEBHOOK_URL
from carousel.timeutil import chicago_now
from config import load_settings

MAKE_WEBHOOK_FOR_STAGE = {
    "a2b": ("a2b_webhook_url", MAKE_A2B_WEBHOOK_URL),
    "a3": ("a3_webhook_url", MAKE_A3_WEBHOOK_URL),
    "a4": ("a4_webhook_url", MAKE_A4_WEBHOOK_URL),
}


def stage_is_python(stage: str) -> bool:
    settings = load_settings()
    return str(settings.get(f"stage_backend_{stage}") or "make").strip().lower() == "python"


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

    env_key, fallback = MAKE_WEBHOOK_FOR_STAGE.get(stage, ("", ""))
    settings = load_settings()
    url = str(settings.get(env_key) or fallback or "").strip()
    if not url:
        return {"backend": "make", "stage": stage, "skipped": "missing_webhook"}
    response = requests.get(
        url,
        params=params,
        headers={"Accept": "text/html, application/json"},
        timeout=40,
    )
    return {
        "backend": "make",
        "stage": stage,
        "status_code": response.status_code,
        "body": (response.text or "")[:300],
    }
