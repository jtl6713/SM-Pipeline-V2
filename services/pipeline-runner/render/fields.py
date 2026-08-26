from __future__ import annotations

import json
from typing import Any


def field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def field_str(record: dict[str, Any], name: str) -> str:
    return str(field(record, name) or "").strip()


def first_linked_id(value: Any) -> str | None:
    ids = linked_ids(value)
    return ids[0] if ids else None


def linked_ids(value: Any) -> list[str]:
    if isinstance(value, list):
        ids: list[str] = []
        for item in value:
            ids.extend(linked_ids(item))
        return ids
    if isinstance(value, dict) and str(value.get("id") or "").startswith("rec"):
        return [str(value["id"])]
    if isinstance(value, str) and value.startswith("rec"):
        return [value]
    return []


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
