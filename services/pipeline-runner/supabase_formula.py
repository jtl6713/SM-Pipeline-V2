"""Allowlisted Airtable formula → PostgREST filters for runner Supabase reads.

Unsupported formulas (JSON FIND, OR of a link lookup, unknown ops) return None
so the caller keeps Airtable. OR of allowlisted predicates is translated.
Platform Outputs, Content Items, Production Requests, Media Assets, and
Carousel Slides are covered. Three Studio produce Platform Output lookups are
the exception: a content number or content record id inside Content_Item, and a
record id stored on the Production_Request_Output link in the full-record bag.
Carousel slide lists translate FIND on PO_Output_ID plus allowlisted slide
predicates. IS_BEFORE/IS_AFTER against NOW() on typed time columns is
translated. A substring FIND on a text field is translated. Views are
translated separately from the snapshot.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from airtable.constants import (
    CAROUSEL_SLIDES_TABLE,
    CONTENT_ITEMS_TABLE,
    MEDIA_ASSETS_TABLE,
    PLATFORM_OUTPUTS_TABLE,
    PRODUCTION_REQUESTS_TABLE,
)
from supabase_pipeline import CONTENT_PATCH_COLUMNS, OUTPUT_PATCH_COLUMNS

_OUTPUT_COLUMNS = {**OUTPUT_PATCH_COLUMNS, "Do_Not_Publish": "do_not_publish"}
_CONTENT_COLUMNS = dict(CONTENT_PATCH_COLUMNS)
_REQUEST_COLUMNS = {
    "Production_Request_ID": "production_request_id",
    "Request_Status": "request_status",
    "Requested_Title": "requested_title",
    "Production_Notes": "production_notes",
    "Studio_Variant_Status": "variant_status",
    "Studio_Output_Plan_Status": "output_plan_status",
}
_MEDIA_COLUMNS = {
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
    "Studio_Transfer_ID": "metadata->>studio_transfer_id",
    "Classification_Status": "metadata->>classification_status",
    "Rights_Status": "metadata->>rights_status",
    "Intake_Date": "metadata->>intake_date",
    "Drive_Access_Status": "metadata->>drive_access_status",
    "Raw_Source_Eligibility": "metadata->>raw_source_eligibility",
    "Exclusion_Reasons": "metadata->>exclusion_reasons",
}

_RECORD_ID = re.compile(r'^RECORD_ID\(\)="(rec[A-Za-z0-9]+)"$')
_EQ = re.compile(r'^\{([A-Za-z0-9_ ]+)\}="([^"]*)"$')
_BLANK = re.compile(r'^\{([A-Za-z0-9_ ]+)\}=BLANK\(\)$')
_EMPTY = re.compile(r'^\{([A-Za-z0-9_ ]+)\}=""$')
_NE_EMPTY = re.compile(r'^\{([A-Za-z0-9_ ]+)\}!=""$')
_NE_BLANK = re.compile(r'^\{([A-Za-z0-9_ ]+)\}!=BLANK\(\)$')
_NE = re.compile(r'^\{([A-Za-z0-9_ ]+)\}!="([^"]+)"$')
_GT = re.compile(r"^\{([A-Za-z0-9_]+)\}>(\d+)$")
_NOT_FIELD = re.compile(r"^NOT\(\{([A-Za-z0-9_]+)\}\)$")
_AND = re.compile(r"^AND\((.*)\)$", re.DOTALL)
_OR = re.compile(r"^OR\((.*)\)$", re.DOTALL)
_SAFE_FIELD = re.compile(r"^[A-Za-z0-9_]+$")
_REC_ID = r"rec[A-Za-z0-9]{14}"
_FIND_CONTENT_TOKEN = re.compile(
    r'^FIND\(",([A-Za-z0-9]+),", "," & ARRAYJOIN\(\{Content_Item\}\) & ","\)>0$'
)
_FIND_CONTENT_ITEM = re.compile(
    rf'^FIND\("({_REC_ID})", ARRAYJOIN\(\{{Content_Item\}}\)\)(?:>0)?$'
)
_FIND_REQUEST_OUTPUT = re.compile(
    rf'^FIND\("({_REC_ID})", ARRAYJOIN\(\{{Production_Request_Output\}}\)\)(?:>0)?$'
)
_FIND_PO_OUTPUT = re.compile(
    r'^FIND\("([^"]+)",\s*ARRAYJOIN\(\{PO_Output_ID\}\)\)(?:>0)?$'
)
_IS_BEFORE_NOW = re.compile(r"^IS_BEFORE\(\{([A-Za-z0-9_]+)\},NOW\(\)\)$")
_IS_AFTER_NOW = re.compile(r"^IS_AFTER\(\{([A-Za-z0-9_]+)\},NOW\(\)\)$")
_SLIDE_SAFE_FIELDS = frozenset({
    "PO_Output_ID",
    "Shared_Asset_Approved",
    "Shared_Asset_Revision",
    "Asset_4x5_Public_Status",
    "Asset_4x5_Public_URL",
    "FB_Photo_Status",
    "FB_Photo_ID",
    "FB_Photo_Package_Revision",
    "Is Cover",
    "Review Status",
    "Slide Number",
    "Current Order",
    "Deleted From Carousel",
})


def _columns(table_id: str) -> dict[str, str]:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return _OUTPUT_COLUMNS
    if table_id == CONTENT_ITEMS_TABLE:
        return _CONTENT_COLUMNS
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return _REQUEST_COLUMNS
    if table_id == MEDIA_ASSETS_TABLE:
        return _MEDIA_COLUMNS
    return {}


def _bag(table_id: str) -> str:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return "error_messages"
    if table_id == PRODUCTION_REQUESTS_TABLE:
        return "publish_status"
    if table_id == MEDIA_ASSETS_TABLE:
        return "metadata"
    if table_id == CAROUSEL_SLIDES_TABLE:
        return "fields"
    return "extras"


def _field_ref(table_id: str, field: str) -> str | None:
    columns = _columns(table_id)
    if field in columns:
        return columns[field]
    if table_id == CAROUSEL_SLIDES_TABLE:
        if field not in _SLIDE_SAFE_FIELDS:
            return None
        # Spaces stay literal; attach_formula_filter quote() encodes them.
        return f"fields->>{field}"
    if not _SAFE_FIELD.match(field or ""):
        return None
    if table_id == PLATFORM_OUTPUTS_TABLE and field == "Content_Item":
        return "content_item_id"
    if field == "Content_Profile" and table_id in (PLATFORM_OUTPUTS_TABLE, CONTENT_ITEMS_TABLE):
        return "content_profile_id"
    if table_id == CONTENT_ITEMS_TABLE and field == "Production_Request":
        return "production_request_id"
    if table_id == PLATFORM_OUTPUTS_TABLE and field == "Production_Request_Output":
        return "production_request_output_text"
    # Densified extras live in jsonb; allow simple key lookup there.
    return f"{_bag(table_id)}->>{field}"


def _split_top_level(args: str) -> list[str] | None:
    parts: list[str] = []
    depth = 0
    start = 0
    in_string = False
    i = 0
    while i < len(args):
        ch = args[i]
        if in_string:
            if ch == "\\" and i + 1 < len(args):
                i += 2
                continue
            if ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return None
        elif ch == "," and depth == 0:
            parts.append(args[start:i].strip())
            start = i + 1
        i += 1
    if depth != 0 or in_string:
        return None
    tail = args[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def _blank_filter(ref: str) -> str:
    # Airtable BLANK covers null and empty string for text-ish fields.
    if ref in {"content_item_id", "content_profile_id", "production_request_id"}:
        return f"{ref}.is.null"
    return f"or({ref}.is.null,{ref}.eq.)"


def _nonempty_filter(ref: str) -> str:
    if ref in {"content_item_id", "content_profile_id", "production_request_id"}:
        return f"{ref}.not.is.null"
    return f"and({ref}.not.is.null,{ref}.neq.)"


def _literal_filter(ref: str, op: str, value: str) -> str | None:
    # Commas and parentheses are PostgREST or()/and() separators. A value
    # that contains them stays on Airtable instead of splitting the filter.
    if any(ch in value for ch in ',()"'):
        return None
    return f"{ref}.{op}.{value}"


def _eq_filter(ref: str, value: str) -> str | None:
    if value == "":
        return _blank_filter(ref)
    # Encode once in attach_formula_filter so spaces do not become %2520.
    return _literal_filter(ref, "eq", value)


def _not_truthy_filter(ref: str) -> str:
    # NOT({Flag}) — treat missing/false/0/empty as matching.
    return f"or({ref}.is.null,{ref}.eq.false,{ref}.eq.0,{ref}.eq.)"


def _join_filters(joiner: str, filters: list[str]) -> str | None:
    """AND can attach produce link params beside column filters. OR cannot."""
    links: list[str] = []
    columns: list[str] = []
    for item in filters:
        if item.startswith("combo:"):
            if joiner == "or":
                return None
            params, _, rest = item[6:].partition("|||")
            if params:
                links.extend(part for part in params.split("&") if part)
            if rest:
                columns.append(rest)
            continue
        if item.startswith("link:"):
            if joiner == "or":
                return None
            links.append(item[5:])
            continue
        columns.append(item)
    column_filter = None
    if len(columns) == 1:
        column_filter = columns[0]
    elif columns:
        column_filter = joiner + "(" + ",".join(columns) + ")"
    if not links:
        return column_filter
    if joiner == "or":
        return None
    params = "&".join(links)
    if not column_filter:
        return "link:" + params
    return f"combo:{params}|||{column_filter}"


def _tighten(text: str) -> str:
    """Drop spaces beside operators so `{Field} = BLANK()` matches the allowlist."""
    out: list[str] = []
    in_string = False
    quote = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < len(text):
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                in_string = False
            i += 1
            continue
        if ch in {'"', "'"}:
            in_string = True
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == " ":
            prev = out[-1] if out else ""
            nxt = text[i + 1] if i + 1 < len(text) else ""
            if prev in "=!<>" or nxt in "=!<>":
                i += 1
                continue
        out.append(ch)
        i += 1
    return "".join(out)


_FIND_CONTAINS = re.compile(
    r'^FIND\("([^"]*)",\s*\{([A-Za-z0-9_]+)\}(?: & "")?\)(>0|=0)$'
)
_FIND_CONTAINS_SQ = re.compile(
    r"^FIND\('([^']*)',\s*\{([A-Za-z0-9_]+)\}(?: & '')?\)(>0|=0)$"
)


def _find_text_filter(table_id: str, text: str) -> str | None:
    """Substring FIND on one field. None when this shape is not safe to translate."""
    match = _FIND_CONTAINS.match(text) or _FIND_CONTAINS_SQ.match(text)
    if not match:
        return None
    needle, field, op = match.group(1), match.group(2), match.group(3)
    if not needle or any(ch in needle for ch in ',()*"'):
        return None
    json_text = {
        "Selected_Assets_JSON": "selected_assets_text",
        "Creative_Render_Manifest_JSON": "creative_render_manifest_text",
        "Render_Clip_List_JSON": "render_clip_list_text",
        "Remotion_Props_JSON": "remotion_props_text",
        "Platform_Publish_Response_JSON": "platform_publish_response_text",
        "Insights_Platform_Metrics_JSON": "insights_metrics_text",
    }
    if table_id == PLATFORM_OUTPUTS_TABLE and field in json_text:
        ref = json_text[field]
        like = f"{ref}.like.*{needle}*"
        if op == ">0":
            return like
        return f"or({ref}.is.null,{ref}.eq.,{ref}.not.like.*{needle}*)"
    ref = _field_ref(table_id, field)
    if not ref:
        return None
    like = f"{ref}.like.*{needle}*"
    if op == ">0":
        return like
    return f"or({ref}.is.null,{ref}.eq.,{ref}.not.like.*{needle}*)"


def _slide_po_output_filter(table_id: str, text: str) -> str | None:
    if table_id != CAROUSEL_SLIDES_TABLE:
        return None
    match = _FIND_PO_OUTPUT.match(text)
    if not match:
        return None
    token = match.group(1)
    if not token or any(ch in token for ch in ',()*"'):
        return None
    # Densified lookup is a JSON array of Output_ID numbers (or strings).
    return f"fields->>PO_Output_ID.like.*{token}*"


def _now_compare_filter(table_id: str, text: str) -> str | None:
    before = _IS_BEFORE_NOW.match(text)
    after = _IS_AFTER_NOW.match(text)
    match = before or after
    if not match:
        return None
    field = match.group(1)
    ref = _field_ref(table_id, field)
    if not ref or "->>" in ref:
        # Only typed timestamp columns; jsonb string compares are unsafe.
        return None
    # NOW() → current UTC. PostgREST accepts ISO timestamps.
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    op = "lt" if before else "gt"
    return f"and({ref}.not.is.null,{ref}.{op}.{now})"


_CHECKBOX_FIELDS = frozenset({
    "Shared_Asset_Approved",
    "Is Cover",
    "Deleted From Carousel",
    "Do_Not_Publish",
    "Active",
    "Do_Not_Use",
    "Studio_Favorite",
    "Auto_Publish_Enabled",
    "Publish_Retry_Eligible",
    "Image_Output_Selected",
})

_LEFT_EQ = re.compile(r'^LEFT\(\{([A-Za-z0-9_]+)\},(\d+)\)="([^"]*)"$')


def _checkbox_one_filter(table_id: str, text: str) -> str | None:
    match = re.match(r"^\{([A-Za-z0-9_ ]+)\}=([01])$", text)
    if not match:
        return None
    field, bit = match.group(1), match.group(2)
    if field not in _CHECKBOX_FIELDS:
        return None
    ref = _field_ref(table_id, field)
    if not ref:
        return None
    if bit == "1":
        return f"or({ref}.eq.true,{ref}.eq.1,{ref}.eq.True)"
    return f"or({ref}.is.null,{ref}.eq.false,{ref}.eq.0,{ref}.eq.False,{ref}.eq.)"


def _left_prefix_filter(table_id: str, text: str) -> str | None:
    """LEFT({Field},N)="prefix" for orch retry Publish_Error_Stage gates."""
    match = _LEFT_EQ.match(text)
    if not match:
        return None
    field, _n, prefix = match.group(1), int(match.group(2)), match.group(3)
    if not prefix or any(ch in prefix for ch in ',()*"'):
        return None
    ref = _field_ref(table_id, field)
    if not ref:
        return None
    return f"{ref}.like.{prefix}*"


def _predicate_filter(table_id: str, pred: str) -> str | None:
    text = _tighten(" ".join(str(pred or "").strip().split()))
    if not text:
        return None
    linked = _produce_link_filter(table_id, text)
    if linked:
        return linked
    slide = _slide_po_output_filter(table_id, text)
    if slide:
        return slide
    now_cmp = _now_compare_filter(table_id, text)
    if now_cmp:
        return now_cmp
    left = _left_prefix_filter(table_id, text)
    if left:
        return left
    if _FIND_CONTAINS.match(text) or _FIND_CONTAINS_SQ.match(text):
        return _find_text_filter(table_id, text)
    upper = text.upper()
    if ("FIND(" in upper or "ARRAYJOIN(" in upper) and not (
        text.startswith("AND(") or text.startswith("OR(")
    ):
        return None

    match = _RECORD_ID.match(text)
    if match:
        return f"airtable_record_id.eq.{match.group(1)}"
    due = re.match(
        r"^\{(YouTube_Action_Due_Now|TikTok_Draft_Action_Due_Now|FB_Action_Due_Now|IG_Carousel_Due_Now|IG_Carousel_All_Children_Ready|Assets_Need_Resolution|TTD0_Asset_Route_Ready)\}=([01])$",
        text,
    )
    if due:
        from publish_queue import due_now_postgrest

        return due_now_postgrest(due.group(1), due.group(2) == "1")

    match = _AND.match(text) or _OR.match(text)
    if match:
        parts = _split_top_level(match.group(1))
        if not parts:
            return None
        filters = []
        for part in parts:
            item = _predicate_filter(table_id, part)
            if item is None:
                return None
            filters.append(item)
        if not filters:
            return None
        if len(filters) == 1:
            return filters[0]
        joiner = "or" if text.startswith("OR(") else "and"
        return _join_filters(joiner, filters)

    match = _NOT_FIELD.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _not_truthy_filter(ref) if ref else None

    checkbox = _checkbox_one_filter(table_id, text)
    if checkbox:
        return checkbox

    match = _EQ.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _eq_filter(ref, match.group(2)) if ref else None

    match = _BLANK.match(text) or _EMPTY.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _blank_filter(ref) if ref else None

    match = _NE_EMPTY.match(text) or _NE_BLANK.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _nonempty_filter(ref) if ref else None

    match = _NE.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _literal_filter(ref, "neq", match.group(2)) if ref else None

    match = _GT.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return f"{ref}.gt.{match.group(2)}" if ref else None

    return None


def _link_param(query: str) -> str:
    """A top-level PostgREST param. Embedded filters cannot sit inside and=()."""
    return f"link:{query}"


def _produce_link_filter(table_id: str, cleaned: str) -> str | None:
    """The three Studio produce output lookups, and nothing else."""
    if table_id != PLATFORM_OUTPUTS_TABLE:
        return None
    match = _FIND_CONTENT_TOKEN.match(cleaned)
    if match:
        token = match.group(1)
        if token.isdigit():
            return f"content_number.eq.{token}"
        if re.fullmatch(_REC_ID, token):
            return f"content_item_airtable_id.eq.{token}"
        return None
    match = _FIND_CONTENT_ITEM.match(cleaned)
    if match:
        return f"content_item_airtable_id.eq.{match.group(1)}"
    match = _FIND_REQUEST_OUTPUT.match(cleaned)
    if match:
        # Full-record rows store the linked Production Request Output rec ids
        # on the bag. A token that is not in that array returns no rows, and
        # the caller falls back to Airtable.
        token = match.group(1)
        return f"production_request_output_text.like.*{token}*"
    return None


def formula_to_postgrest_filter(table_id: str, formula: str | None) -> str | None:
    """Return a PostgREST `and=(...)` / single filter expression, or None."""
    if table_id not in (
        PLATFORM_OUTPUTS_TABLE,
        CONTENT_ITEMS_TABLE,
        PRODUCTION_REQUESTS_TABLE,
        MEDIA_ASSETS_TABLE,
        CAROUSEL_SLIDES_TABLE,
    ):
        return None
    if formula is None:
        return None
    cleaned = " ".join(str(formula).strip().split())
    if not cleaned:
        return None
    # Hard reject patterns that need Airtable semantics we do not translate.
    # FIND/ARRAYJOIN are handled per clause so the three produce lookups and
    # carousel PO_Output_ID FIND can sit inside AND. IS_BEFORE/IS_AFTER against
    # NOW() on typed time columns are handled per clause. Any other FIND or
    # datetime helper still returns None.
    upper = cleaned.upper()
    for token in ("SEARCH(", "REGEX", "DATETIME_"):
        if token in upper:
            return None
    if "IS_BEFORE" in upper and "NOW()" not in upper:
        return None
    if "IS_AFTER" in upper and "NOW()" not in upper:
        return None
    return _predicate_filter(table_id, cleaned)


def attach_formula_filter(path: str, formula_filter: str | None) -> str:
    if not formula_filter:
        return path
    if formula_filter.startswith("combo:"):
        params, _, rest = formula_filter[6:].partition("|||")
        path = f"{path}&{params}" if params else path
        return attach_formula_filter(path, rest or None)
    if formula_filter.startswith("link:"):
        return f"{path}&{formula_filter[5:]}"
    # PostgREST `and=(...)` query param. Keep structural chars; encode values
    # already handled inside each predicate.
    safe = "(),.=*_->>%"
    if formula_filter.startswith("and(") and formula_filter.endswith(")"):
        return f"{path}&and={quote(formula_filter[3:], safe=safe)}"
    return f"{path}&and=({quote(formula_filter, safe=safe)})"
