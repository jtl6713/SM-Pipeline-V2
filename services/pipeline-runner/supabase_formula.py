"""Allowlisted Airtable formula → PostgREST filters for runner Output/Content reads.

Unsupported formulas (FIND/ARRAYJOIN/OR/views/unknown ops) return None so the
caller keeps Airtable. Only Platform Outputs and Content Items are covered.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from supabase_pipeline import CONTENT_PATCH_COLUMNS, OUTPUT_PATCH_COLUMNS

_OUTPUT_COLUMNS = {**OUTPUT_PATCH_COLUMNS, "Do_Not_Publish": "do_not_publish"}
_CONTENT_COLUMNS = dict(CONTENT_PATCH_COLUMNS)

_RECORD_ID = re.compile(r'^RECORD_ID\(\)="(rec[A-Za-z0-9]+)"$')
_EQ = re.compile(r'^\{([A-Za-z0-9_]+)\}="([^"]*)"$')
_BLANK = re.compile(r'^\{([A-Za-z0-9_]+)\}=BLANK\(\)$')
_EMPTY = re.compile(r'^\{([A-Za-z0-9_]+)\}=""$')
_NE_EMPTY = re.compile(r'^\{([A-Za-z0-9_]+)\}!=""$')
_NE_BLANK = re.compile(r'^\{([A-Za-z0-9_]+)\}!=BLANK\(\)$')
_GT = re.compile(r"^\{([A-Za-z0-9_]+)\}>(\d+)$")
_NOT_FIELD = re.compile(r"^NOT\(\{([A-Za-z0-9_]+)\}\)$")
_AND = re.compile(r"^AND\((.*)\)$", re.DOTALL)
_SAFE_FIELD = re.compile(r"^[A-Za-z0-9_]+$")


def _columns(table_id: str) -> dict[str, str]:
    if table_id == PLATFORM_OUTPUTS_TABLE:
        return _OUTPUT_COLUMNS
    if table_id == CONTENT_ITEMS_TABLE:
        return _CONTENT_COLUMNS
    return {}


def _bag(table_id: str) -> str:
    return "error_messages" if table_id == PLATFORM_OUTPUTS_TABLE else "extras"


def _field_ref(table_id: str, field: str) -> str | None:
    if not _SAFE_FIELD.match(field or ""):
        return None
    columns = _columns(table_id)
    if field in columns:
        return columns[field]
    # Densified extras live in jsonb; allow simple key lookup there.
    return f"{_bag(table_id)}->>{field}"


def _split_top_level(args: str) -> list[str] | None:
    parts: list[str] = []
    depth = 0
    start = 0
    i = 0
    while i < len(args):
        ch = args[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return None
        elif ch == "," and depth == 0:
            parts.append(args[start:i].strip())
            start = i + 1
        i += 1
    if depth != 0:
        return None
    tail = args[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def _blank_filter(ref: str) -> str:
    # Airtable BLANK covers null and empty string for text-ish fields.
    return f"or({ref}.is.null,{ref}.eq.)"


def _nonempty_filter(ref: str) -> str:
    return f"and({ref}.not.is.null,{ref}.neq.)"


def _eq_filter(ref: str, value: str) -> str:
    if value == "":
        return _blank_filter(ref)
    # Encode once in attach_formula_filter so spaces do not become %2520.
    return f"{ref}.eq.{value}"


def _not_truthy_filter(ref: str) -> str:
    # NOT({Flag}) — treat missing/false/0/empty as matching.
    return f"or({ref}.is.null,{ref}.eq.false,{ref}.eq.0,{ref}.eq.)"


def _predicate_filter(table_id: str, pred: str) -> str | None:
    text = " ".join(str(pred or "").strip().split())
    if not text:
        return None

    match = _RECORD_ID.match(text)
    if match:
        return f"airtable_record_id.eq.{match.group(1)}"

    match = _AND.match(text)
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
        return "and(" + ",".join(filters) + ")"

    match = _NOT_FIELD.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return _not_truthy_filter(ref) if ref else None

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

    match = _GT.match(text)
    if match:
        ref = _field_ref(table_id, match.group(1))
        return f"{ref}.gt.{match.group(2)}" if ref else None

    return None


def formula_to_postgrest_filter(table_id: str, formula: str | None) -> str | None:
    """Return a PostgREST `and=(...)` / single filter expression, or None."""
    if table_id not in (PLATFORM_OUTPUTS_TABLE, CONTENT_ITEMS_TABLE):
        return None
    if formula is None:
        return None
    cleaned = " ".join(str(formula).strip().split())
    if not cleaned:
        return None
    # Hard reject patterns that need Airtable semantics we do not translate.
    upper = cleaned.upper()
    for token in ("FIND(", "ARRAYJOIN(", "OR(", "SEARCH(", "REGEX", "DATETIME_", "IS_AFTER", "IS_BEFORE"):
        if token in upper:
            return None
    return _predicate_filter(table_id, cleaned)


def attach_formula_filter(path: str, formula_filter: str | None) -> str:
    if not formula_filter:
        return path
    # PostgREST `and=(...)` query param. Keep structural chars; encode values
    # already handled inside each predicate.
    safe = "(),.=*_->>"
    if formula_filter.startswith("and(") and formula_filter.endswith(")"):
        return f"{path}&and={quote(formula_filter[3:], safe=safe)}"
    return f"{path}&and=({quote(formula_filter, safe=safe)})"
