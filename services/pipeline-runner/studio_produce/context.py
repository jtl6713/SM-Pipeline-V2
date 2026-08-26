from __future__ import annotations

from typing import TYPE_CHECKING, Any

from render.fields import field, field_str, first_linked_id, linked_ids
from studio_produce.constants import (
    CONTENT_ITEMS_TABLE,
    JOB_FIELD,
    MEDIA_TRANSFER_QUEUE_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
)
from studio_produce.job import parse_job, parse_json

if TYPE_CHECKING:
    from airtable.client import AirtableClient


def load_request(client: AirtableClient, record_id: str) -> dict[str, Any]:
    return client.get_record(PRODUCTION_REQUESTS_TABLE, record_id)


def load_parent(client: AirtableClient, request: dict[str, Any]) -> dict[str, Any] | None:
    parent_id = first_linked_id(field(request, "Promoted_Content_Item"))
    if not parent_id:
        return None
    return client.get_record(CONTENT_ITEMS_TABLE, parent_id)


def outputs_formula(request_id: str, parent_id: str | None = None, content_id: str | int | None = None) -> str:
    if content_id not in (None, ""):
        return f'FIND(",{content_id},", "," & ARRAYJOIN({{Content_Item}}) & ",")>0'
    if parent_id:
        return f'FIND("{parent_id}", ARRAYJOIN({{Content_Item}}))'
    return f'FIND("{request_id}", ARRAYJOIN({{Production_Request_Output}}))'


def _parent_output_ids(parent: dict[str, Any] | None) -> list[str]:
    if not parent:
        return []
    return linked_ids(field(parent, "Platform Outputs")) or linked_ids(field(parent, "Platform_Outputs"))


def load_outputs(
    client: AirtableClient,
    request_id: str,
    parent: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if parent is None:
        parent = load_parent(client, client.get_record(PRODUCTION_REQUESTS_TABLE, request_id))
    ids = _parent_output_ids(parent)
    if ids:
        rows = [client.get_record(PLATFORM_OUTPUTS_TABLE, record_id) for record_id in ids]
        rows.sort(key=lambda row: int(field(row, "Output_ID") or 0), reverse=True)
        return rows
    content_id = field(parent, "Content_ID") if parent else None
    parent_id = (parent or {}).get("id")
    return client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=outputs_formula(request_id, parent_id, content_id),
        max_records=50,
        sort_field="Output_ID",
        sort_direction="desc",
    )


def load_queue_rows(client: AirtableClient, request_id: str) -> list[dict[str, Any]]:
    return client.list_records(
        MEDIA_TRANSFER_QUEUE_TABLE,
        formula=f'{{Production_Request_Record_ID}}="{request_id}"',
        max_records=100,
    )


def load_slides(client: AirtableClient, parent: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not parent:
        return []
    from carousel.parent import load_linked_slides

    return load_linked_slides(client, parent)


def master_assets(request: dict[str, Any]) -> list[dict[str, Any]]:
    parsed = parse_json(field(request, "Studio_Master_Assets_JSON"), [])
    return [item for item in parsed if isinstance(item, dict) and item.get("id")] if isinstance(parsed, list) else []


def expected_photo_count(request: dict[str, Any], assets: list[dict[str, Any]] | None = None) -> int:
    rows = assets if assets is not None else master_assets(request)
    count = len(rows)
    notes = str(field(request, "Production_Notes") or "")
    manual = _note_count(notes, r"ez-manual=(\d+)")
    ai = _note_count(notes, r"ez-ai=(\d+)")
    if manual and ai:
        return manual + ai
    mode = field_str(request, "Carousel_Image_Mode")
    exact = int(field(request, "Carousel_Slide_Count_Exact") or 0)
    plan = parse_json(field(request, "Studio_Output_Plan_JSON"), {}) or {}
    plan_count = int(plan.get("source_asset_count") or 0)
    if mode == "Make AI Generated" and exact > count:
        return exact
    if mode == "Make AI Generated" and plan_count > count:
        return plan_count
    if not count and mode == "Make AI Generated" and exact >= 1:
        return exact
    return count or exact or plan_count or 0


def _note_count(notes: str, pattern: str) -> int:
    import re

    match = re.search(pattern, notes, re.I)
    if not match:
        return 0
    try:
        value = int(match.group(1))
    except (TypeError, ValueError):
        return 0
    return value if value > 0 else 0


def slide_image_url(slide: dict[str, Any]) -> str:
    return (
        field_str(slide, "Final Image URL")
        or field_str(slide, "AI Image URL")
        or field_str(slide, "Current Image URL")
    )


def variant_manifest(request: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_json(field(request, "Studio_Variant_Manifest_JSON"), {}) or {}
    return parsed if isinstance(parsed, dict) else {}


def read_job(request: dict[str, Any]) -> dict[str, Any]:
    return parse_job(field(request, JOB_FIELD))


def write_job(client: AirtableClient, request_id: str, job: dict[str, Any]) -> dict[str, Any]:
    import json

    return client.update_record(
        PRODUCTION_REQUESTS_TABLE,
        request_id,
        {JOB_FIELD: json.dumps(job)},
    )
