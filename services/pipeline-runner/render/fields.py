from __future__ import annotations

import json
from typing import Any


def field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def field_str(record: dict[str, Any], name: str) -> str:
    return str(field(record, name) or "").strip()


def first_linked_id(value: Any) -> str | None:
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, str) and first.startswith("rec"):
            return first
    if isinstance(value, str) and value.startswith("rec"):
        return value
    return None


def parse_json_field(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except json.JSONDecodeError:
        return None


def json_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, separators=(",", ":"))
