from __future__ import annotations

from datetime import timedelta
from typing import Any

from asset.helpers import parse_int
from carousel.timeutil import iso_utc, utc_now
from render.fields import field, field_str, json_text

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
        "platform": "Instagram",
        "stage": stage,
    }


def retry_at(minutes: int) -> str:
    return iso_utc(utc_now() + timedelta(minutes=minutes))


def response_json(payload: Any) -> str:
    return json_text(payload)


def append_note(record: dict[str, Any], stamp: str) -> str:
    notes = field_str(record, "Output_Notes")
    return f"{notes}\n\n{stamp}".strip() if notes else stamp


def unlock_fields() -> dict[str, Any]:
    return {
        "Publish_Locked_At": None,
        "Publish_Locked_By": "",
        "Publish_Started_At": None,
    }


def ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def setting_int(settings: Any, name: str, default: int) -> int:
    return parse_int(settings.get(name), default) or default


def is_due(record: dict[str, Any]) -> bool:
    raw = field(record, "IG_Carousel_Due_Now")
    if raw in (None, ""):
        return True
    return str(raw).strip() not in {"0", "false", "False"}


def expected_child_count(record: dict[str, Any], ready_count: int = 0) -> int:
    for name in ("IG_Carousel_Child_Count", "Image_Count", "Selected_Clip_Count"):
        count = parse_int(field(record, name), 0) or 0
        if count > 1:
            return count
    return ready_count if ready_count > 1 else 0


def publish_caption(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    if caption and hashtags:
        return f"{caption}\n\n{hashtags}"
    return caption or hashtags


def reconcile_caption(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    return f"{caption}\n\n{hashtags}".strip()
