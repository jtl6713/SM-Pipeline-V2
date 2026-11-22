"""Supabase-only runner records. All legacy Airtable read flags are ignored.

Allowlisted formulas/views translate to PostgREST queries. Unsupported
predicates fail explicitly and never use Airtable or fabricated empty lists.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from airtable.constants import (
    CAROUSEL_SLIDES_TABLE,
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    IDEA_BATCHES_TABLE,
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
    MEDIA_TRANSFER_QUEUE_TABLE,
    PIPELINE_SETTINGS_TABLE,
    ENGAGEMENT_SETTINGS_TABLE,
    CONTENT_PROFILES_TABLE,
    CAROUSEL_SLIDES_TABLE,
    SOURCE_CANDIDATES_TABLE,
    IDEA_BATCHES_TABLE,
})

# Legacy R4 expects these Airtable-named fields. Render package details are
# authoritative typed columns in Supabase; old error_messages copies are often
# missing or stale. Read them without widening the generic write mapper.
_OUTPUT_FIELDS = {
    **OUTPUT_PATCH_COLUMNS,
    "Do_Not_Publish": "do_not_publish",
    "Output_Filename": "output_filename",
    "Render_Total_Frames": "render_total_frames",
}
_CONTENT_FIELDS = dict(CONTENT_PATCH_COLUMNS)
_REQUEST_FIELDS = {
    "Production_Request_ID": "production_request_id",
    "Request_Status": "request_status",
    "Requested_Title": "requested_title",
    "Production_Notes": "production_notes",
    "Studio_Master_Asset_Status": "master_asset_status",
    "Studio_Variant_Status": "variant_status",
    "Studio_Output_Plan_Status": "output_plan_status",
    # The Worker and runner commit these as typed JSONB. If omitted from the
    # projection, the runner rereads an empty job, generates a fresh spj-* ID,
    # and loops through production while discarding the source/variant plan.
    "Studio_Master_Assets_JSON": "master_assets",
    "Studio_Output_Plan_JSON": "output_plan",
    "Studio_Variant_Manifest_JSON": "variant_manifest",
    "Studio_Production_Job_JSON": "production_job",
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
    """Only Supabase is a valid runner read authority.

    Ignore STUDIO_RUNNER_*_READ_SOURCE and legacy write toggles. A missing
    credential or unsupported table is unavailable, never an Airtable fallback.
    """
    if not supabase_configured(settings):
        return "unavailable"
    return "supabase" if table_id in FALLBACK_STOPPED_TABLES else "unavailable"

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
    if table_id == MEDIA_TRANSFER_QUEUE_TABLE:
        return "studio_media_transfer_queue"
    if table_id == CAROUSEL_SLIDES_TABLE:
        return "carousel_slides"
    if table_id == SOURCE_CANDIDATES_TABLE:
        return "idea_candidates"
    if table_id == IDEA_BATCHES_TABLE:
        return "idea_batches"
    if table_id == CONTENT_PROFILES_TABLE:
        return "content_profiles"
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



# I1 title originality requires the *complete* 365-day candidate + content
# history. The legacy REGEX_MATCH/CREATED_TIME formula cannot be translated by
# the general PostgREST formula mapper. A partial first page is NOT evidence
# that a title is unique. This narrow, exact-shape adapter scans all canonical
# rows with keyset-stable ascending pagination, then applies the same
# normalized-prefix test as the legacy formula.
def _i1_title_formula_prefix(table_id: str, formula: str | None) -> tuple[str, str] | None:
    import re

    if table_id == SOURCE_CANDIDATES_TABLE:
        field, test_clause = "Candidate_Title", "{Test_Run_ID}=BLANK(),"
    elif table_id == CONTENT_ITEMS_TABLE:
        field, test_clause = "Content_Title", ""
    else:
        return None
    lead = (
        f'AND({test_clause}IS_AFTER(CREATED_TIME(),DATEADD(TODAY(),-365,"days")),'
        f'REGEX_MATCH(REGEX_REPLACE(LOWER({{{field}}}&""),"[^a-z0-9]",""),"^'
    )
    expression = str(formula or "").strip()
    if not expression.startswith(lead) or not expression.endswith('"))'):
        return None
    prefix = expression[len(lead):-3]
    if not re.fullmatch(r"[a-z0-9]{1,8}", prefix):
        return None
    return field, prefix


def _i1_title_page_scan(
    settings: dict, table: str, column: str, cutoff: str, *,
    since_updated: str | None = None,
    exclude_test_runs: bool = False,
) -> list[dict]:
    """Return every matching row, or raise. Never truncate a uniqueness scan."""
    page_size = 500
    max_pages = 100  # Fail closed rather than treating an excessive scan as complete.
    rows: list[dict] = []
    for page in range(max_pages):
        params = (
            f"{table}?select=airtable_record_id,{column}"
            f"&created_at=gte.{quote(cutoff, safe=':-T')}"
        )
        if since_updated:
            params += f"&updated_at=gte.{quote(since_updated, safe=':-T')}"
        if exclude_test_runs:
            # Airtable BLANK matches null/missing and empty Test_Run_ID.
            params += "&or=(payload->>Test_Run_ID.is.null,payload->>Test_Run_ID.eq.)"
        # created_at is immutable; updated_at allows a bounded fresh delta.
        sort = "updated_at" if since_updated else "created_at"
        params += (
            f"&order={sort}.asc,airtable_record_id.asc"
            f"&limit={page_size}&offset={page * page_size}"
        )
        try:
            payload = _rest(settings, params, "GET")
        except Exception as error:
            raise RuntimeError(
                f"Incomplete canonical Supabase I1 title history ({table} page {page}); "
                "refusing duplicate-risk generation"
            ) from error
        if not isinstance(payload, list) or len(payload) > page_size or any(
            not isinstance(row, dict)
            or not isinstance(row.get("airtable_record_id"), str)
            or not isinstance(row.get(column), str)
            for row in payload
        ):
            raise RuntimeError(
                f"Invalid canonical Supabase I1 title history ({table} page {page}); "
                "refusing duplicate-risk generation"
            )
        rows.extend(payload)
        if len(payload) < page_size:
            return rows
    raise RuntimeError(
        f"Canonical Supabase I1 title history exceeded {max_pages * page_size} "
        f"rows for {table}; refusing duplicate-risk generation"
    )


def try_list_i1_title_history(
    settings: dict | None, table_id: str, formula: str | None, *,
    max_records: int, fields: list[str] | None,
    cache: dict | None = None,
) -> list[dict] | None:
    """Exact I1 history formula, complete paginated Supabase read, no archive.

    The per-client cache is a snapshot only: each subsequent query rereads
    rows created or edited since the snapshot began, so new titles from another
    profile cannot be silently missed during a long generation run.
    """
    from datetime import datetime, timedelta, timezone
    import re

    match = _i1_title_formula_prefix(table_id, formula)
    if not match:
        return None
    field, prefix = match
    if fields != [field] or max_records != 1001:
        return None
    if runner_table_read_source(settings, table_id) != "supabase":
        raise RuntimeError("Canonical Supabase I1 title history unavailable; no Airtable fallback")
    table = _supabase_table(table_id)
    column = "candidate_title" if table_id == SOURCE_CANDIDATES_TABLE else "content_title"
    # Conservatively include an extra day for Airtable TODAY() timezone edges.
    started = datetime.now(timezone.utc)
    cutoff = (started.date() - timedelta(days=366)).isoformat() + "T00:00:00Z"
    key = (table_id, cutoff)
    entry = cache.get(key) if cache is not None else None
    if entry is None:
        history = _i1_title_page_scan(
            settings or {}, table, column, cutoff,
            exclude_test_runs=(table_id == SOURCE_CANDIDATES_TABLE),
        )
        if cache is not None:
            cache[key] = (started, history)
    else:
        snapshot_started, history = entry
        # Fresh delta includes new rows and renamed titles; never reuse the
        # cached snapshot alone to assert uniqueness across concurrent runs.
        delta_start = (snapshot_started - timedelta(seconds=2)).isoformat()
        recent = _i1_title_page_scan(
            settings or {}, table, column, cutoff,
            since_updated=delta_start,
            exclude_test_runs=(table_id == SOURCE_CANDIDATES_TABLE),
        )
        combined = {row["airtable_record_id"]: row for row in history}
        combined.update({row["airtable_record_id"]: row for row in recent})
        history = list(combined.values())
    matches = []
    for row in history:
        raw = re.sub(r"[^a-z0-9]", "", row[column].lower())
        if raw.startswith(prefix):
            matches.append({"id": row["airtable_record_id"], "fields": {field: row[column]}})
            if len(matches) >= max_records:
                break
    return matches


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
    """Supabase-shaped compatibility rows, or None for unsupported queries."""
    from airtable.constants import MEDIA_TRANSFER_QUEUE_TABLE
    from queue_reads import try_list_queue_records
    from settings_store import list_settings

    if table_id == MEDIA_TRANSFER_QUEUE_TABLE and not view:
        return try_list_queue_records(settings, formula=formula, max_records=max_records)
    try:
        stored_settings = list_settings(settings, table_id, formula, max_records)
    except Exception as error:
        logger.warning("supabase settings read failed for %s; no Airtable fallback: %s", table_id, error)
        stored_settings = None
    if stored_settings is not None:
        return stored_settings
    if runner_table_read_source(settings, table_id) != "supabase":
        return None
    # Unknown views and views that use an Airtable formula field stay on Airtable.
    # A snapshotted view filter is combined with an allowlisted formula.
    # Carousel slide lists already encode readiness in the formula (PO_Output_ID
    # FIND + status predicates). Orch Ready/retry formulas encode platform and
    # lock gates the same way. An unknown Airtable view name must not force
    # Airtable when that formula translates.
    view_filter = ""
    if view:
        view_filter = view_to_postgrest_filter(table_id, view)
        if view_filter is None:
            if table_id in {CAROUSEL_SLIDES_TABLE, PLATFORM_OUTPUTS_TABLE} and formula:
                view_filter = ""
            else:
                # Unsupported view is not evidence of a zero-row result.
                return None
    formula_filter = None
    if formula:
        formula_filter = formula_to_postgrest_filter(table_id, formula)
        if formula_filter is None:
            # Unsupported formula must not be misreported as an empty query.
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
    # Carousel/idea/profile lists shape from payload bags; typed-column maps may be empty.
    if not columns and table_id not in {
        CAROUSEL_SLIDES_TABLE, SOURCE_CANDIDATES_TABLE, CONTENT_PROFILES_TABLE, IDEA_BATCHES_TABLE,
    }:
        return None
    if fields and columns and any(name not in columns for name in fields):
        return None
    order_column = "airtable_record_id"
    if sort_field:
        order_column = columns.get(sort_field) or ""
        if not order_column and table_id == MEDIA_ASSETS_TABLE and sort_field == "Intake_Date":
            order_column = "metadata->>intake_date"
        if not order_column:
            return None
    direction = "desc" if str(sort_direction or "").lower() == "desc" else "asc"
    limit = max(1, min(int(max_records or 10), 100))
    select = _list_select(table_id)
    if "->>" in order_column:
        order_clause = f"{order_column}.{direction}.nullslast"
    else:
        order_clause = f"{quote(order_column, safe='')}." + direction
    path = (
        f"{table}?select={quote(select, safe='(),*')}"
        f"&order={order_clause}&limit={limit}"
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
            "content_items(airtable_record_id,content_title),content_profiles(airtable_record_id)"
        )
    if table_id == CONTENT_ITEMS_TABLE:
        return f"{base},extras,content_profiles(airtable_record_id)"
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return f"{base},publish_status"
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
    if table_id == IDEA_BATCHES_TABLE:
        return "airtable_record_id,batch_id,status,requested_count,generated_count,quality,content_profile_airtable_id,fields,requested_at,completed_at,created_at"
    if table_id == CONTENT_PROFILES_TABLE:
        return "airtable_record_id,profile_name,brand_name,market_name,active,platform_setup"
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
    elif table_id == MEDIA_TRANSFER_QUEUE_TABLE:
        # Read ONE queue row with the same authoritative densifier as its
        # list query. A transfer in Supabase could be listed successfully but
        # get_record failed before the crop/preview step and blocked ITEM4.
        from queue_reads import _shape as shape_transfer_row

        return shape_transfer_row(row)
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
    elif table_id == IDEA_BATCHES_TABLE:
        bag = row.get("fields") if isinstance(row.get("fields"), dict) else {}
        columns = {
            "Batch_ID": "batch_id",
            "Status": "status",
            "Requested_Count": "requested_count",
            "Generated_Count": "generated_count",
            "Quality": "quality",
        }
    elif table_id == CONTENT_PROFILES_TABLE:
        bag = row.get("platform_setup") if isinstance(row.get("platform_setup"), dict) else {}
        columns = {
            "Profile_Name": "profile_name",
            "Brand_Name": "brand_name",
            "Market_Name": "market_name",
            "Active": "active",
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
        # TikTok TTD1 and YouTube YT0 require an output title. Factory
        # outputs may have a blank typed output_title even when the exact
        # linked authoritative Content Item has its approved title. Derive
        # the read-side title from the Supabase FK join only. Never override
        # a nonblank output title, change the write authority, or infer from
        # unrelated sibling outputs.
        if (
            str(shaped["fields"].get("Platform") or "").strip().casefold() in {"tiktok", "youtube"}
            and not str(shaped["fields"].get("Output_Title") or "").strip()
        ):
            parent = row.get("content_items")
            parent_title = (
                str(parent.get("content_title") or "").strip()
                if isinstance(parent, dict) else ""
            )
            if parent_title:
                shaped["fields"]["Output_Title"] = parent_title
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
        # Library densify lives in metadata (no content_profile_id FK column).
        # A3 requires Content_Profile; without this map every classify skips.
        meta = bag if isinstance(bag, dict) else {}
        profile_id = str(meta.get("content_profile_airtable_id") or "").strip()
        if profile_id.startswith("rec") and "Content_Profile" not in shaped["fields"]:
            shaped["fields"]["Content_Profile"] = [profile_id]
        if meta.get("rights_status") is not None and "Rights_Status" not in shaped["fields"]:
            shaped["fields"]["Rights_Status"] = meta.get("rights_status")
        if meta.get("asset_description") is not None and "Asset_Description" not in shaped["fields"]:
            shaped["fields"]["Asset_Description"] = meta.get("asset_description")
        if meta.get("studio_transfer_id") and "Studio_Transfer_ID" not in shaped["fields"]:
            shaped["fields"]["Studio_Transfer_ID"] = meta.get("studio_transfer_id")
        if meta.get("google_drive_url") and "Google Drive URL" not in shaped["fields"]:
            shaped["fields"]["Google Drive URL"] = meta.get("google_drive_url")
        if meta.get("classification_status") is not None and "Classification_Status" not in shaped["fields"]:
            shaped["fields"]["Classification_Status"] = meta.get("classification_status")
        if meta.get("drive_access_status") is not None and "Drive_Access_Status" not in shaped["fields"]:
            shaped["fields"]["Drive_Access_Status"] = meta.get("drive_access_status")
        if meta.get("raw_source_eligibility") is not None and "Raw_Source_Eligibility" not in shaped["fields"]:
            shaped["fields"]["Raw_Source_Eligibility"] = meta.get("raw_source_eligibility")
        if meta.get("exclusion_reasons") is not None and "Exclusion_Reasons" not in shaped["fields"]:
            shaped["fields"]["Exclusion_Reasons"] = meta.get("exclusion_reasons")
        if meta.get("potential_match_notes") is not None and "Potential_Match_Notes" not in shaped["fields"]:
            shaped["fields"]["Potential_Match_Notes"] = meta.get("potential_match_notes")
        if meta.get("search_keywords") is not None and "Search_Keywords" not in shaped["fields"]:
            shaped["fields"]["Search_Keywords"] = meta.get("search_keywords")
        if meta.get("ai_tags") is not None and "AI_Tags" not in shaped["fields"]:
            shaped["fields"]["AI_Tags"] = meta.get("ai_tags")
        if meta.get("location") is not None and "Location" not in shaped["fields"]:
            shaped["fields"]["Location"] = meta.get("location")
        if meta.get("topic") is not None and "Topic" not in shaped["fields"]:
            shaped["fields"]["Topic"] = meta.get("topic")
        if meta.get("subtopic") is not None and "Subtopic" not in shaped["fields"]:
            shaped["fields"]["Subtopic"] = meta.get("subtopic")
        if meta.get("shot_type") is not None and "Shot_Type" not in shaped["fields"]:
            shaped["fields"]["Shot_Type"] = meta.get("shot_type")
        if meta.get("time_of_day") is not None and "Time_Of_Day" not in shaped["fields"]:
            shaped["fields"]["Time_Of_Day"] = meta.get("time_of_day")
        if meta.get("weather") is not None and "Weather" not in shaped["fields"]:
            shaped["fields"]["Weather"] = meta.get("weather")
        if meta.get("visible_subjects") is not None and "Visible_Subjects" not in shaped["fields"]:
            shaped["fields"]["Visible_Subjects"] = meta.get("visible_subjects")
        if meta.get("manual_classification_json") is not None and "Manual_Classification_JSON" not in shaped["fields"]:
            shaped["fields"]["Manual_Classification_JSON"] = meta.get("manual_classification_json")
        if meta.get("manual_classification_audit") is not None and "Manual_Classification_Audit" not in shaped["fields"]:
            shaped["fields"]["Manual_Classification_Audit"] = meta.get("manual_classification_audit")
        if meta.get("intake_date") is not None and "Intake_Date" not in shaped["fields"]:
            shaped["fields"]["Intake_Date"] = meta.get("intake_date")
    elif table_id == SOURCE_CANDIDATES_TABLE and row.get("status") is not None:
        shaped["fields"]["Candidate_Status"] = row.get("status")
    elif table_id == CONTENT_PROFILES_TABLE:
        if row.get("profile_name") is not None:
            shaped["fields"]["Profile_Name"] = row.get("profile_name")
        if row.get("brand_name") is not None:
            shaped["fields"]["Brand_Name"] = row.get("brand_name")
        if row.get("market_name") is not None:
            shaped["fields"]["Market_Name"] = row.get("market_name")
        if "Active" not in shaped["fields"]:
            shaped["fields"]["Active"] = row.get("active") is True
        elif row.get("active") is not None:
            shaped["fields"]["Active"] = bool(row.get("active"))
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


class SupabaseRecordMiss(LookupError):
    """Supabase SoR answered empty for a FALLBACK_STOPPED table.

    AirtableClient must not GET the frozen archive for these misses — same
    fail-closed posture as Worker 0.10.948 Output/Content record GETs.
    """


def try_get_supabase_record(settings: dict | None, table_id: str, record_id: str) -> dict | None:
    """One Airtable-shaped record, or None when this call must use Airtable.

    Lean Worker stamps may omit _runner_record_projection; the bag and typed
    columns are still authoritative when this table's runner read source is
    Supabase. A Supabase transport/schema error still returns None so the
    caller can use Airtable. An empty SoR miss on FALLBACK_STOPPED_TABLES
    raises SupabaseRecordMiss instead of counting an archive GET.
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
        select = "*,content_items(airtable_record_id,content_title),content_profiles(airtable_record_id)"
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
        if table_id in FALLBACK_STOPPED_TABLES:
            logger.info(
                "supabase SoR record miss; skipping Airtable archive GET %s %s",
                table_id,
                record_id,
            )
            raise SupabaseRecordMiss(table_id, record_id)
        return None
    return _record_from_row(payload[0], table_id)
