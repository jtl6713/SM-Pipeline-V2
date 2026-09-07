"""Load the regression catalog and pick the next one-at-a-time live id."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = Path(__file__).resolve().with_name("catalog.json")
STATE_DIR = Path(__file__).resolve().with_name("state")
STATE_PATH = STATE_DIR / "last-run.json"


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def live_ids(catalog: dict[str, Any] | None = None) -> list[str]:
    data = catalog or load_catalog()
    rotation = list(data.get("rotation") or [])
    live = data.get("live") or {}
    missing = [key for key in rotation if key not in live]
    extra = [key for key in live if key not in rotation]
    if missing or extra:
        raise RuntimeError(f"catalog rotation mismatch missing={missing} extra={extra}")
    return rotation


def get_live(live_id: str, catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    data = catalog or load_catalog()
    row = (data.get("live") or {}).get(live_id)
    if not isinstance(row, dict):
        raise KeyError(f"unknown live id: {live_id}")
    return {**row, "id": live_id}


def photo_rows(spec: dict[str, Any], catalog: dict[str, Any] | None = None) -> list[dict[str, str]]:
    data = catalog or load_catalog()
    photos = data.get("photos") or {}
    rows = []
    for key in spec.get("photos") or []:
        item = photos.get(key)
        if not isinstance(item, dict) or not item.get("url"):
            raise KeyError(f"unknown photo key: {key}")
        rows.append({"filename": str(item["filename"]), "url": str(item["url"])})
    return rows


def next_live_id(requested: str | None = None) -> str:
    catalog = load_catalog()
    ids = live_ids(catalog)
    if requested:
        if requested not in ids:
            raise KeyError(f"unknown live id: {requested}")
        return requested
    last = ""
    if STATE_PATH.exists():
        try:
            last = str(json.loads(STATE_PATH.read_text(encoding="utf-8")).get("id") or "")
        except json.JSONDecodeError:
            last = ""
    if last in ids:
        return ids[(ids.index(last) + 1) % len(ids)]
    return ids[0]


def remember_live_id(live_id: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps({"id": live_id}, indent=2) + "\n", encoding="utf-8")
