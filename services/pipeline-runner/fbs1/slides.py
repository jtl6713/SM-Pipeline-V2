from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from asset.helpers import parse_int
from fbs1.constants import MAX_SLIDES, SLIDES_TABLE_VIEW
from render.fields import field, field_str


def slide_formula(output_id: str) -> str:
    safe = str(output_id or "").replace("\\", "\\\\").replace('"', '\\"')
    return (
        f'AND(FIND("{safe}",ARRAYJOIN({{PO_Output_ID}}))>0,'
        '{Shared_Asset_Approved}=1,{Asset_4x5_Public_Status}="Ready",{Asset_4x5_Public_URL}!=BLANK())'
    )


def _sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return (
        parse_int(field(record, "Current Order"), 10**9) or 10**9,
        parse_int(field(record, "Slide Number"), 10**9) or 10**9,
    )


def list_ready_slides(client: AirtableClient, output_id: str) -> list[dict[str, Any]]:
    formula = slide_formula(output_id)
    try:
        rows = client.list_records(
            CAROUSEL_SLIDES_TABLE,
            formula=formula,
            view=SLIDES_TABLE_VIEW,
            max_records=MAX_SLIDES,
        )
    except Exception:
        rows = client.list_records(
            CAROUSEL_SLIDES_TABLE,
            formula=formula,
            max_records=MAX_SLIDES,
        )
    return sorted(rows, key=_sort_key)


def slide_clip(record: dict[str, Any]) -> dict[str, Any]:
    url = field_str(record, "Asset_4x5_Public_URL")
    return {
        "url": url,
        "durationFrames": 90,
        "slideNumber": str(field(record, "Slide Number") or ""),
        "order": str(field(record, "Current Order") or ""),
        "revision": field_str(record, "Shared_Asset_Revision") or url,
    }
