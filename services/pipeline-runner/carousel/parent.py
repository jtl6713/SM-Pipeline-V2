"""Load a Content Item and its linked carousel slides."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE
from carousel.formulas import matches_test_run
from render.fields import field, field_str, first_linked_id


def load_parent(
    client: AirtableClient,
    content_item_record_id: str,
    *,
    test_run_id: str | None = None,
) -> dict[str, Any] | None:
    if not content_item_record_id:
        return None
    parent = client.get_record(CONTENT_ITEMS_TABLE, content_item_record_id)
    if not matches_test_run(field_str(parent, "Test_Run_ID"), test_run_id or ""):
        return None
    return parent


def linked_slide_ids(parent: dict[str, Any]) -> list[str]:
    raw = field(parent, "Carousel Slides")
    if not isinstance(raw, list):
        return []
    ids: list[str] = []
    for item in raw:
        if isinstance(item, str) and item.startswith("rec"):
            ids.append(item)
        elif isinstance(item, dict) and str(item.get("id") or "").startswith("rec"):
            ids.append(str(item["id"]))
    return ids


def load_linked_slides(client: AirtableClient, parent: dict[str, Any]) -> list[dict[str, Any]]:
    slides: list[dict[str, Any]] = []
    for slide_id in linked_slide_ids(parent):
        try:
            slides.append(client.get_record(CAROUSEL_SLIDES_TABLE, slide_id))
        except Exception:
            continue
    slides.sort(key=lambda row: (int(field(row, "Slide Number") or 0), field_str(row, "Slide Name")))
    return slides


def parent_id_from_slide(slide: dict[str, Any]) -> str | None:
    return first_linked_id(field(slide, "Content Item"))
