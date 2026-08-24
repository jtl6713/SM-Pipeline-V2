from __future__ import annotations

from datetime import timedelta
from typing import Any

from carousel.timeutil import iso_utc, utc_now
from render.fields import json_text

RECORD_ID_PREFIX = "rec"


def valid_record_id(record_id: str) -> bool:
    return record_id.startswith(RECORD_ID_PREFIX) and len(record_id) == 17


def preview(*, stage: str, make_id: int, make_name: str, output_record_id: str | None, test_run_id: str | None) -> dict[str, Any]:
    return {
        "make_scenario_id": make_id,
        "make_scenario_name": make_name,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
        "social_publish": True,
        "platform": "YouTube",
        "stage": stage,
    }


def retry_at(minutes: int) -> str:
    return iso_utc(utc_now() + timedelta(minutes=minutes))


def response_json(payload: Any) -> str:
    return json_text(payload)
