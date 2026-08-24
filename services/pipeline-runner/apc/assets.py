from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from apc.common import ci
from apc.constants import ASSET_READY, CHILD_FINISHED, MAX_SLIDES, PUBLIC_MEDIA_BASE
from asset.helpers import parse_int
from carousel.constants import C9_FINAL_SLIDES_VIEW
from render.fields import field, field_str


def _sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return (
        parse_int(field(record, "Current Order"), 10**9) or 10**9,
        parse_int(field(record, "Slide Number"), 10**9) or 10**9,
    )


def output_slide_formula(output_id: str, extra: str = "") -> str:
    safe = str(output_id or "").replace("\\", "\\\\").replace('"', '\\"')
    clause = f'FIND("{safe}",ARRAYJOIN({{PO_Output_ID}}))>0'
    return f"AND({clause},{extra})" if extra else clause


def list_output_slides(
    client: AirtableClient,
    output_id: str,
    *,
    extra: str = "",
    view: str | None = None,
    max_records: int = MAX_SLIDES,
) -> list[dict[str, Any]]:
    rows = client.list_records(
        CAROUSEL_SLIDES_TABLE,
        formula=output_slide_formula(output_id, extra),
        view=view,
        max_records=max_records,
    )
    return sorted(rows, key=_sort_key)


def list_final_slides(client: AirtableClient, output_id: str) -> list[dict[str, Any]]:
    return list_output_slides(client, output_id, view=C9_FINAL_SLIDES_VIEW)


def list_child_slides(client: AirtableClient, output_id: str) -> list[dict[str, Any]]:
    return list_output_slides(client, output_id, extra='{IG_Child_Container_ID}!=BLANK()')


def list_finished_children(client: AirtableClient, output_id: str) -> list[dict[str, Any]]:
    return list_output_slides(
        client,
        output_id,
        extra=f'{{IG_Child_Container_Status}}="{CHILD_FINISHED}",{{IG_Child_Container_ID}}!=BLANK()',
    )


def list_ready_public_assets(client: AirtableClient, output_id: str) -> list[dict[str, Any]]:
    return list_output_slides(client, output_id, extra=f'{{IG_Public_Asset_Status}}="{ASSET_READY}"')


def current_order(slide: dict[str, Any]) -> int:
    return parse_int(field(slide, "Current Order"), parse_int(field(slide, "Slide Number"), 0) or 0) or 0


def source_image_url(slide: dict[str, Any]) -> str:
    current = field_str(slide, "Current Image URL")
    if current:
        return current
    asset = field_str(slide, "Asset_4x5_Public_URL")
    if asset:
        return asset
    public = field_str(slide, "IG_Public_Asset_URL")
    if "/lettered/" in public:
        return public
    return ""


def r2_object_key(prefix: str, output_id: Any, slide: dict[str, Any]) -> str:
    order = current_order(slide)
    padded = f"{order:02d}" if order < 10 else str(order)
    return f"{str(prefix or '').strip().strip('/')}/output-{output_id}/slide-{padded}.jpg"


def public_asset_url(key: str) -> str:
    return f"{PUBLIC_MEDIA_BASE}/{key.lstrip('/')}"


def saved_public_url(source_url: str, generated_url: str) -> str:
    return source_url if "/lettered/" in source_url else generated_url


def child_ids(slides: list[dict[str, Any]]) -> list[str]:
    return [field_str(slide, "IG_Child_Container_ID") for slide in slides if field_str(slide, "IG_Child_Container_ID")]


def child_finished(slide: dict[str, Any]) -> bool:
    status = ci(field_str(slide, "IG_Child_Container_Status"))
    return status in {ci(CHILD_FINISHED), "published"}


def child_terminal(slide: dict[str, Any]) -> bool:
    return ci(field_str(slide, "IG_Child_Container_Status")) in {ci("ERROR"), ci("EXPIRED")}
