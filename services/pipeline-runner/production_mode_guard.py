"""#3094: Runner-side manual Production approval fence.

Only a server-authenticated, exact already-Submitted Production Request
may carry a manual Idea through I3/I4. Legacy mode and Finished Video
retain their existing approval semantics. No provider/scheduling authority.
"""
from __future__ import annotations

import os
import re

from config import load_settings
from supabase_pipeline import _rest

REC_ID = re.compile(r"rec[A-Za-z0-9]{14}\Z")


def mode_capture_enabled() -> bool:
    return os.environ.get("STUDIO_PRODUCTION_MODE_CAPTURE") == "true"


def project_typed_idea_mode(row: dict, fields: dict) -> None:
    """Never let an obsolete or user-controlled JSON bag set mode authority."""
    fields.pop("Studio_Production_Mode", None)
    fields.pop("Studio_Production_Source", None)
    source, mode = row.get("production_source"), row.get("production_mode")
    valid = (
        source == "idea" and mode in ("automatic", "manual")
        or source in ("script_a_short", "finished_video", "vibe_cut") and mode == "automatic"
    )
    if valid:
        fields["Studio_Production_Mode"] = mode
        fields["Studio_Production_Source"] = source


def explicit_manual_idea(candidate: dict) -> bool:
    fields = candidate.get("fields") or {}
    return fields.get("Studio_Production_Source") == "idea" and fields.get("Studio_Production_Mode") == "manual"


def verify_manual_submitted_owner(idea_id: str, request_id: str | None, *, rest=None) -> bool:
    """Exact fresh typed owner read; never infer approval from an Idea status."""
    if not isinstance(idea_id, str) or not REC_ID.fullmatch(idea_id):
        return False
    if not isinstance(request_id, str) or not REC_ID.fullmatch(request_id):
        return False
    getter = rest or (lambda path: _rest(load_settings(), path, "GET"))
    rows = getter(
        "production_requests?airtable_record_id=eq." + request_id
        + "&select=airtable_record_id,idea_candidate_id,request_status,promoted_content_item_id,"
        + "idea_candidates!inner(id,airtable_record_id,production_mode,production_source)"
        + "&limit=2"
    )
    if not isinstance(rows, list) or len(rows) != 1:
        return False
    row = rows[0]
    if not isinstance(row, dict):
        return False
    idea = row.get("idea_candidates")
    return bool(
        isinstance(idea, dict) and idea.get("id")
        and row.get("airtable_record_id") == request_id
        and row.get("idea_candidate_id") == idea["id"]
        and idea.get("airtable_record_id") == idea_id
        and idea.get("production_mode") == "manual"
        and idea.get("production_source") == "idea"
        and row.get("request_status") == "Submitted"
        and not row.get("promoted_content_item_id")
    )
