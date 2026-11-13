"""Phase 5 remainder: optional runner reads of Platform Outputs and Content Items.

Airtable stays the default. Each table has its own flag, so a global
STUDIO_READ_SOURCE value cannot turn both on. STUDIO_WRITE_SOURCE does not
turn these reads on. Allowlisted formulas translate to PostgREST filters;
views and FIND/ARRAYJOIN that are not a stored-column view or a text/link
lookup stay on Airtable. OR of allowlisted predicates is translated. Three
Studio produce Platform Output link lookups are the FIND exception, including
inside AND. OR of a link lookup stays on Airtable. A substring FIND on a JSON
column stays on Airtable.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from airtable.constants import (
    CAROUSEL_SLIDES_TABLE,
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    MEDIA_TRANSFER_QUEUE_TABLE,
    PIPELINE_SETTINGS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
    SOURCE_CANDIDATES_TABLE,
)
from settings_store import ENGAGEMENT_SETTINGS_TABLE, settings_source
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter
from supabase_views import view_to_postgrest_filter
from supabase_pipeline import (
    CONTENT_PATCH_COLUMNS,
    OUTPUT_JSON_COLUMNS,
    OUTPUT_PATCH_COLUMNS,
    _rest,
    studio_phase6_write_source,
    studio_write_source,
    supabase_configured,
)

logger = logging.getLogger("pipeline-runner.supabase-reads")

# An empty Supabase list for these tables is the answer. Output and Content
# writes already commit to Supabase, and both copies are ahead of the frozen
# Airtable archive, so a zero-row filter must not be read from Airtable again.
FALLBACK_STOPPED_TABLES: frozenset[str] = frozenset({
    PLATFORM_OUTPUTS_TABLE,
    CONTENT_ITEMS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
    MEDIA_ASSETS_TABLE,
    PIPELINE_SETTINGS_TABLE,
    ENGAGEMENT_SETTINGS_TABLE,
})

_OUTPUT_FIELDS = {**OUTPUT_PATCH_COLUMNS, "Do_Not_Publish": "do_not_publish"}
_CONTENT_FIELDS = dict(CONTENT_PATCH_COLUMNS)
_REQUEST_FIELDS = {
    "Production_Request_ID": "production_request_id",
    "Request_Status": "request_status",
    "Requested_Title": "requested_title",
    "Production_Notes": "production_notes",
    "Studio_Variant_Status": "variant_status",
    "Studio_Output_Plan_Status": "output_plan_status",
}
_MEDIA_FIELDS = {
    "Asset Name": "asset_name",
    "Media_Class": "media_class",
    "Asset_Role": "asset_role",
    "Asset_Status": "asset_status",
    "Active": "active",
    "Do_Not_Use": "do_not_use",
    "Studio_Favorite": "studio_favorite",
    "Google Drive File ID": "google_drive_file_id",
    "Google Drive URL": "google_drive_url",
    "MIME_Type": "mime_type",
    "File_Extension": "file_extension",
    "File_Size_Bytes": "file_size_bytes",
}


def runner_table_read_source(settings: dict | None, table_id: str) -> str:
    """Return supabase when this table's rows already live there under SoR.

    Platform Outputs and Content Items still honor their runner read flags.
    Settings, ideas, slides, and Phase 6 tables leave the hard airtable return
    when the matching write source is supabase. Untranslated formulas still
    return None from try_list_supabase_records and stay on Airtable.
    """
    if not supabase_configured(settings):
        return "airtable"
    if table_id == PLATFORM_OUTPUTS_TABLE:
        key = "studio_runner_output_read_source"
        raw = str((settings or {}).get(key) or "airtable").strip().lower()
        return "supabase" if raw == "supabase" else "airtable"
    if table_id == CONTENT_ITEMS_TABLE:
        key = "studio_runner_content_read_source"
        raw = str((settings or {}).get(key) or "airtable").strip().lower()
        return "supabase" if raw == "supabase" else "airtable"
    if settings_source(table_id) and studio_write_source(settings) == "supabase":
        return "supabase"
    if table_id in {SOURCE_CANDIDATES_TABLE, CAROUSEL_SLIDES_TABLE} and studio_write_source(settings) == "supabase":
        return "supabase"
    if table_id in {PRODUCTION_REQUESTS_TABLE, MEDIA_ASSETS_TABLE, MEDIA_TRANSFER_QUEUE_TABLE}:
        if studio_phase6_write_source(settings) == "supabase":
            return "supabase"
    return "airtable"


def _columns_for(table_id: str) -> dict[str, str]:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return _OUTPUT_FIELDS
    if table_id == CONTENT_ITEMS_TABLE:
        return _CONTENT_FIELDS
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return _REQUEST_FIELDS
    if table_id == MEDIA_ASSETS_TABLE:
        return _MEDIA_FIELDS
    return {}


def _supabase_table(table_id: str) -> str:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return "platform_outputs"
    if table_id == CONTENT_ITEMS_TABLE:
        return "content_items"
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return "production_requests"
    if table_id == MEDIA_ASSETS_TABLE:
        return "media_assets"
    if table_id == CAROUSEL_SLIDES_TABLE:
        return "carousel_slides"
    if table_id == SOURCE_CANDIDATES_TABLE:
        return "idea_candidates"
    return ""


def _shaped(row: dict, columns: dict[str, str], requested: list[str] | None) -> dict | None:
    record_id = str(row.get("airtable_record_id") or "").strip()
    if not record_id:
        return None
    wanted = set(requested) if requested else None
    fields: dict[str, Any] = {}
    for airtable_key, column in columns.items():
        if wanted is not None and airtable_key not in wanted:
            continue
        if column not in row or row.get(column) is None:
            continue
        value = row.get(column)
        if airtable_key == "Do_Not_Publish":
            value = bool(value)
        fields[airtable_key] = value
    return {"id": record_id, "fields": fields}


def try_list_supabase_records(
    settings: dict | None,
    table_id: str,
    *,
    formula: str | None = None,
    view: str | None = None,
    max_records: int = 10,
    fields: list[str] | None = None,
    sort_field: str | None = None,
    sort_direction: str = "asc",
) -> list[dict] | None:
    """Airtable-shaped rows, or None when this call must use Airtable."""
    from airtable.constants import MEDIA_TRANSFER_QUEUE_TABLE
    from queue_reads import try_list_queue_records
    from settings_store import list_settings

    if table_id == MEDIA_TRANSFER_QUEUE_TABLE and not view:
        return try_list_queue_records(settings, formula=formula, max_records=max_records)
    try:
        stored_settings = list_settings(settings, table_id, formula, max_records)
    except Exception as error:
        logger.warning("supabase settings read failed for %s; using Airtable: %s", table_id, error)
        stored_settings = None
    if stored_settings is not None:
        return stored_settings
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    # Unknown views and views that use an Airtable formula field stay on Airtable.
    # A snapshotted view filter is combined with an allowlisted formula.
    # Carousel slide lists already encode readiness in the formula (PO_Output_ID
    # FIND + status predicates). An unknown Airtable view name must not force
    # Airtable when that formula translates.
    view_filter = ""
    if view:
        view_filter = view_to_postgrest_filter(table_id, view)
        if view_filter is None:
            if table_id == CAROUSEL_SLIDES_TABLE and formula:
                view_filter = ""
            else:
                return None
    formula_filter = None
    if formula:
        formula_filter = formula_to_postgrest_filter(table_id, formula)
        if formula_filter is None:
            return None
    if view_filter and formula_filter:
        from supabase_formula import _join_filters

        formula_filter = _join_filters("and", [view_filter, formula_filter])
        if formula_filter is None:
            return None
    elif view_filter:
        formula_filter = view_filter
    table = _supabase_table(table_id)
    if not table:
        return None
    columns = _columns_for(table_id)
    # Carousel/idea lists shape from payload bags; typed-column maps may be empty.
    if not columns and table_id not in {CAROUSEL_SLIDES_TABLE, SOURCE_CANDIDATES_TABLE}:
        return None
    if fields and columns and any(name not in columns for name in fields):
        return None
    order_column = "airtable_record_id"
    if sort_field:
        order_column = columns.get(sort_field) or ""
        if not order_column:
            return None
    direction = "desc" if str(sort_direction or "").lower() == "desc" else "asc"
    limit = max(1, min(int(max_records or 10), 100))
    select = _list_select(table_id)
    path = (
        f"{table}?select={quote(select, safe='(),*')}"
        f"&order={quote(order_column, safe='')}.{direction}&limit={limit}"
    )
    path = attach_formula_filter(path, formula_filter)
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase runner read failed for %s; using Airtable: %s", table_id, error)
        return None
    stopped = table_id in FALLBACK_STOPPED_TABLES
    if not isinstance(payload, list) or not payload:
        return [] if stopped else None
    records = []
    for row in payload:
        if not isinstance(row, dict):
            return None
        shaped = _record_from_row(row, table_id)
        # Unmarked rows are still valid when Supabase is the runner read
        # source. Skipping them forced Airtable fallback and hid Worker lean
        # stamps (TikTok_Draft_Publish_ID) after the archive freeze.
        # A table in FALLBACK_STOPPED_TABLES returns shaped rows only.
        if not shaped:
            continue
        if fields:
            shaped = {
                "id": shaped["id"],
                "fields": {key: value for key, value in shaped["fields"].items() if key in fields},
            }
        records.append(shaped)
    if not records:
        return [] if stopped else None
    return records[:limit]


def _list_select(table_id: str) -> str:
    columns = _columns_for(table_id)
    base = ",".join(["airtable_record_id", *dict.fromkeys(columns.values())])
    if table_id == PLATFORM_OUTPUTS_TABLE:
        blobs = ",".join(OUTPUT_JSON_COLUMNS.values())
        return (
            f"{base},error_messages,{blobs},"
            "content_items(airtable_record_id),content_profiles(airtable_record_id)"
        )
    if table_id == CONTENT_ITEMS_TABLE:
        return f"{base},extras,content_profiles(airtable_record_id)"
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return f"{base},publish_status,production_job"
    if table_id == MEDIA_ASSETS_TABLE:
        return f"{base},metadata"
    if table_id == CAROUSEL_SLIDES_TABLE:
        # Typed columns + jsonb bag. There is no `payload` column on carousel_slides.
        return (
            "airtable_record_id,current_order,deleted_from_carousel,"
            "ig_child_container_id,voiceover,creative_directives,fields"
        )
    if table_id == SOURCE_CANDIDATES_TABLE:
        return "airtable_record_id,candidate_title,idea_summary,status,payload"
    return base


def _overlay_bag(fields: dict[str, Any], bag: dict, *, typed_keys: set[str] | None = None) -> None:
    """Copy bag keys into fields. Typed SoR columns must not be overwritten.

    Partial Output patches write TikTok_Draft_Status (etc.) to typed columns
    while _pack excludes them from the bag merge, so a stale bag value can
    linger. Overlay used to apply bag last and TTD2 then saw
    Ready for Delivery over live Processing (Vizcaya 4988 / SoHo 5031).
    """
    reserved = typed_keys or set()
    for key, value in bag.items():
        if not key or str(key).startswith("_") or value is None:
            continue
        if key in reserved and key in fields:
            continue
        fields[key] = value


def _linked(row: dict, key: str) -> str:
    value = row.get(key)
    if isinstance(value, dict):
        return str(value.get("airtable_record_id") or "").strip()
    return ""


def _record_from_row(row: dict, table_id: str) -> dict | None:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        bag = row.get("error_messages") if isinstance(row.get("error_messages"), dict) else {}
        columns = _OUTPUT_FIELDS
    elif table_id == CONTENT_ITEMS_TABLE:
        bag = row.get("extras") if isinstance(row.get("extras"), dict) else {}
        columns = _CONTENT_FIELDS
    elif table_id == PRODUCTION_REQUESTS_TABLE:
        bag = row.get("publish_status") if isinstance(row.get("publish_status"), dict) else {}
        columns = _REQUEST_FIELDS
    elif table_id == MEDIA_ASSETS_TABLE:
        bag = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        columns = _MEDIA_FIELDS
    elif table_id == CAROUSEL_SLIDES_TABLE:
        bag = row.get("fields") if isinstance(row.get("fields"), dict) else {}
        columns = {}
    elif table_id == SOURCE_CANDIDATES_TABLE:
        bag = row.get("payload") if isinstance(row.get("payload"), dict) else {}
        columns = {
            "Candidate_Title": "candidate_title",
            "Idea_Summary": "idea_summary",
            "Candidate_Status": "status",
        }
    else:
        return None
    # Full densify still stamps _runner_record_projection=v1. Rejecting
    # unmarked rows forced Airtable fallback; with runner output reads on
    # Supabase and Airtable archive writes frozen, that hid lean Worker
    # stamps (TikTok_Draft_Publish_ID only) and TTD2 never saw publish_id.
    # Bag first, then typed columns win — same order as Worker
    # airtableShapedOutputFromSupabase.
    record_id = str(row.get("airtable_record_id") or "").strip()
    if not record_id:
        return None
    fields: dict[str, Any] = {}
    _overlay_bag(fields, bag, typed_keys=set(columns))
    shaped = _shaped(row, columns, None) if columns else {"id": record_id, "fields": {}}
    if not shaped:
        return None
    fields.update(shaped["fields"])
    shaped = {"id": record_id, "fields": fields}
    if table_id == PLATFORM_OUTPUTS_TABLE:
        for airtable_key, column in OUTPUT_JSON_COLUMNS.items():
            if row.get(column) is not None:
                shaped["fields"][airtable_key] = row.get(column)
        content_id = _linked(row, "content_items")
        profile_id = _linked(row, "content_profiles")
        if content_id:
            shaped["fields"]["Content_Item"] = [content_id]
        if profile_id:
            shaped["fields"]["Content_Profile"] = [profile_id]
        from publish_queue import apply_publish_queue_fields

        apply_publish_queue_fields(shaped["fields"])
    elif table_id == CONTENT_ITEMS_TABLE:
        profile_id = _linked(row, "content_profiles")
        if profile_id:
            shaped["fields"]["Content_Profile"] = [profile_id]
    elif table_id == MEDIA_ASSETS_TABLE:
        meta = bag if isinstance(bag, dict) else {}
        if meta.get("rights_status") is not None and "Rights_Status" not in shaped["fields"]:
            shaped["fields"]["Rights_Status"] = meta.get("rights_status")
        if meta.get("asset_description") is not None and "Asset_Description" not in shaped["fields"]:
            shaped["fields"]["Asset_Description"] = meta.get("asset_description")
        if meta.get("studio_transfer_id") and "Studio_Transfer_ID" not in shaped["fields"]:
            shaped["fields"]["Studio_Transfer_ID"] = meta.get("studio_transfer_id")
        if meta.get("google_drive_url") and "Google Drive URL" not in shaped["fields"]:
            shaped["fields"]["Google Drive URL"] = meta.get("google_drive_url")
    elif table_id == SOURCE_CANDIDATES_TABLE and row.get("status") is not None:
        shaped["fields"]["Candidate_Status"] = row.get("status")
    elif table_id == CAROUSEL_SLIDES_TABLE:
        if row.get("current_order") is not None and "Current Order" not in shaped["fields"]:
            shaped["fields"]["Current Order"] = row.get("current_order")
        if "Deleted From Carousel" not in shaped["fields"]:
            shaped["fields"]["Deleted From Carousel"] = row.get("deleted_from_carousel") is True
        if row.get("ig_child_container_id") and "IG_Child_Container_ID" not in shaped["fields"]:
            shaped["fields"]["IG_Child_Container_ID"] = row.get("ig_child_container_id")
        voice = row.get("voiceover") if isinstance(row.get("voiceover"), dict) else {}
        if voice.get("status") is not None and "Slide_Voiceover_Status" not in shaped["fields"]:
            shaped["fields"]["Slide_Voiceover_Status"] = voice.get("status")
        if voice.get("url") is not None and "Slide_Voiceover_URL" not in shaped["fields"]:
            shaped["fields"]["Slide_Voiceover_URL"] = voice.get("url")
        if voice.get("text") is not None and "Slide_Voiceover_Text" not in shaped["fields"]:
            shaped["fields"]["Slide_Voiceover_Text"] = voice.get("text")
        directives = row.get("creative_directives")
        if isinstance(directives, dict) and directives and "Creative_Directives_JSON" not in shaped["fields"]:
            import json as _json

            shaped["fields"]["Creative_Directives_JSON"] = _json.dumps(directives)
    return shaped


def try_get_supabase_record(settings: dict | None, table_id: str, record_id: str) -> dict | None:
    """One Airtable-shaped record, or None when this call must use Airtable.

    Lean Worker stamps may omit _runner_record_projection; the bag and typed
    columns are still authoritative when this table's runner read source is
    Supabase. A missing row or a Supabase error stays on Airtable.
    """
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    record_id = str(record_id or "").strip()
    if not record_id:
        return None
    table = _supabase_table(table_id)
    if not table:
        return None
    if table_id == PLATFORM_OUTPUTS_TABLE:
        select = "*,content_items(airtable_record_id),content_profiles(airtable_record_id)"
    elif table_id == CONTENT_ITEMS_TABLE:
        select = "*,content_profiles(airtable_record_id)"
    else:
        select = "*"
    path = (
        f"{table}?airtable_record_id=eq.{quote(record_id, safe='')}"
        f"&select={quote(select, safe='(),*')}&limit=1"
    )
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase runner get failed for %s %s; using Airtable: %s", table_id, record_id, error)
        return None
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        return None
    return _record_from_row(payload[0], table_id)
