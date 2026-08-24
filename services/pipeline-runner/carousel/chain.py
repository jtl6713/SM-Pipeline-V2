"""Daisy-chain the next carousel stage to Python or Make."""

from __future__ import annotations

from typing import Any, Callable

import requests

from carousel.constants import (
    SETTING_C3_WEBHOOK,
    SETTING_C4_WEBHOOK,
    SETTING_C5_WEBHOOK,
    SETTING_C6_WEBHOOK,
    SETTING_C7_WEBHOOK,
    SETTING_C8_WEBHOOK,
    SETTING_C9_WEBHOOK,
)
from config import load_settings
from item4.settings import pipeline_settings

SETTING_FOR_STAGE = {
    "c3": SETTING_C3_WEBHOOK,
    "c4": SETTING_C4_WEBHOOK,
    "c5": SETTING_C5_WEBHOOK,
    "c6": SETTING_C6_WEBHOOK,
    "c7": SETTING_C7_WEBHOOK,
    "c8": SETTING_C8_WEBHOOK,
    "c9": SETTING_C9_WEBHOOK,
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

    setting_name = SETTING_FOR_STAGE.get(stage)
    if not setting_name:
        return {"backend": "make", "stage": stage, "skipped": "unknown_stage"}
    url = pipeline_settings().get(setting_name)
    if not url:
        return {"backend": "make", "stage": stage, "skipped": "missing_webhook_setting"}
    response = requests.post(
        url,
        headers={"Content-Type": "application/json", "Accept": "text/plain, application/json"},
        json=payload,
        timeout=40,
    )
    return {
        "backend": "make",
        "stage": stage,
        "status_code": response.status_code,
        "body": (response.text or "")[:300],
    }
