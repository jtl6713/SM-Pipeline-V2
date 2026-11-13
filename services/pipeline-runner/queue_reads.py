"""Crop and variant queue lists from studio_media_transfer_queue.

Attempt_Count and Last_Attempt_At are stored columns. The SMV1 selectors
translate when every clause is a status, kind, preview, test-run, request,
source, or aspect comparison. Anything else stays on Airtable. An empty
Supabase page stays on Airtable because the queue copy is still short of
the Airtable total. Record deletion is not started.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

from supabase_pipeline import _rest, studio_phase6_write_source

logger = logging.getLogger("pipeline-runner.queue-reads")

_FIELDS = {
    "Transfer_Status": "status",
    "Asset_Kind": "payload->>asset_kind",
    "Preview_Status": "payload->>preview_status",
    "Test_Run_ID": "payload->>test_run_id",
    "Production_Request_Record_ID": "payload->>production_request_record_id",
    "Source_Drive_File_ID": "payload->>source_drive_file_id",
    "Aspect_Ratio": "payload->>aspect_ratio",
    "Source_Asset_ID": "payload->>source_asset_id",
}

_PAYLOAD_FIELDS = {
    "transfer_id": "Transfer_ID",
    "production_request_record_id": "Production_Request_Record_ID",
    "asset_kind": "Asset_Kind",
    "source_asset_id": "Source_Asset_ID",
    "source_name": "Source_Name",
    "source_drive_file_id": "Source_Drive_File_ID",
    "source_media_asset_id": "Source_Media_Asset",
    "generated_media_asset_id": "Generated_Media_Asset",
    "aspect_ratio": "Aspect_Ratio",
    "preview_status": "Preview_Status",
    "test_run_id": "Test_Run_ID",
    "media_asset_record_id": "Media_Asset_Record_ID",
}


def _tighten(text: str) -> str:
    out: list[str] = []
    in_string = False
    quote_char = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < len(text):
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote_char:
                in_string = False
            i += 1
            continue
        if ch in {'"', "'"}:
            in_string = True
            quote_char = ch
            out.append(ch)
            i += 1
            continue
        if ch.isspace():
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _split_top(args: str) -> list[str] | None:
    parts: list[str] = []
    depth = 0
    start = 0
    in_string = False
    quote_char = ""
    i = 0
    while i < len(args):
        ch = args[i]
        if in_string:
            if ch == "\\" and i + 1 < len(args):
                i += 2
                continue
            if ch == quote_char:
                in_string = False
            i += 1
            continue
        if ch in {'"', "'"}:
            in_string = True
            quote_char = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return None
        elif ch == "," and depth == 0:
            parts.append(args[start:i])
            start = i + 1
        i += 1
    if depth != 0 or in_string:
        return None
    tail = args[start:]
    if tail:
        parts.append(tail)
    return parts


def _predicate(text: str) -> str | None:
    if text.startswith("AND(") and text.endswith(")"):
        return _join("and", text[4:-1])
    if text.startswith("OR(") and text.endswith(")"):
        return _join("or", text[3:-1])
    if text.endswith("=BLANK()") and text.startswith("{") and text.count("{") == 1:
        field = text[1:text.index("}")]
        ref = _FIELDS.get(field)
        if not ref or text != "{" + field + "}=BLANK()":
            return None
        return f"or({ref}.is.null,{ref}.eq.)"
    for quote_char in ('"', "'"):
        marker = "}=" + quote_char
        if marker not in text or not text.endswith(quote_char) or not text.startswith("{"):
            continue
        field, _, value = text[1:].partition(marker)
        if not field or "}" in field:
            continue
        value = value[:-1]
        ref = _FIELDS.get(field)
        if not ref or any(ch in value for ch in ',()"'):
            return None
        return f"{ref}.eq.{value}"
    return None


def _join(joiner: str, args: str) -> str | None:
    parts = _split_top(args)
    if not parts:
        return None
    filters = []
    for part in parts:
        item = _predicate(part)
        if item is None:
            return None
        filters.append(item)
    if len(filters) == 1:
        return filters[0]
    return joiner + "(" + ",".join(filters) + ")"


def queue_formula_filter(formula: str | None) -> str | None:
    cleaned = _tighten(str(formula or ""))
    if not cleaned:
        return None
    return _predicate(cleaned)


def _shape(row: dict) -> dict | None:
    record_id = str(row.get("airtable_record_id") or "").strip()
    if not record_id:
        return None
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    fields: dict[str, Any] = {}
    if row.get("status") is not None:
        fields["Transfer_Status"] = row.get("status")
    if row.get("error_message") is not None:
        fields["Error_Message"] = row.get("error_message")
    if row.get("preview_error") is not None:
        fields["Preview_Error"] = row.get("preview_error")
    if row.get("attempt_count") is not None:
        fields["Attempt_Count"] = row.get("attempt_count")
    if row.get("last_attempt_at"):
        fields["Last_Attempt_At"] = row.get("last_attempt_at")
    if row.get("updated_at"):
        fields["Updated_At"] = row.get("updated_at")
    for column, airtable_key in _PAYLOAD_FIELDS.items():
        if payload.get(column):
            value = payload.get(column)
            if airtable_key in {"Source_Media_Asset", "Generated_Media_Asset"}:
                value = [value]
            fields[airtable_key] = value
    targets = payload.get("target_production_request_output_ids")
    if isinstance(targets, list) and targets:
        fields["Target_Production_Request_Outputs"] = targets
    return {"id": record_id, "fields": fields}


def try_list_queue_records(settings: dict | None, *, formula: str | None, max_records: int) -> list[dict] | None:
    if studio_phase6_write_source(settings) != "supabase":
        return None
    translated = queue_formula_filter(formula)
    if not translated:
        return None
    limit = max(1, min(int(max_records or 10), 100))
    safe = "(),.=*_->>"
    path = (
        "studio_media_transfer_queue?select="
        "airtable_record_id,status,error_message,preview_error,attempt_count,last_attempt_at,updated_at,payload"
        f"&order=updated_at.desc&limit={limit}&and=({quote(translated, safe=safe)})"
    )
    try:
        payload = _rest(settings or {}, path, "GET")
    except Exception as error:
        logger.warning("supabase queue list failed; using Airtable: %s", error)
        return None
    if not isinstance(payload, list):
        return None
    if not payload:
        return []
    records = [shaped for row in payload if isinstance(row, dict) and (shaped := _shape(row))]
    return records
