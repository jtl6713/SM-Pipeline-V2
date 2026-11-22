"""Incident #2670: exact, publisher-fenced I3/I4 approval through Supabase only.

The user has already approved the saved Production Request in the Worker.
This module is NOT a general I3 webhook or an approval bypass. The Worker
must first authenticate tenant/brand, write Submitted and pass its exact
Production Request record id with the original Idea id. No direct user
route, no provider publishing or schedule release is enabled here.
"""
from __future__ import annotations

import json
import re

from airtable.client import AirtableClient
from airtable.constants import PRODUCTION_REQUESTS_TABLE, SOURCE_CANDIDATES_TABLE
from config import load_settings
from supabase_pipeline import _rest

REC_ID = re.compile(r"rec[A-Za-z0-9]{14}\Z")
PROMOTION_ACTIONS = frozenset(("carousel_submit", "video_submit", "studio_promote"))
PROMOTION_KEYS = frozenset((
    "record_id", "production_request_record_id", "trigger_i4", "action", "decision",
    "production_content_type", "production_platforms", "include_voiceover",
    "include_background_music", "include_thumbnail", "voiceover_tail_seconds",
    "production_config_notes", "carousel_image_mode", "carousel_slide_count",
    "video_duration", "video_clip_count", "video_asset_mode", "platform_label",
))


def parse_recovery_promotion(payload):
    """Strict shape: no bulk, delete, tune, dry-run, test, or unowned I3 call."""
    if not isinstance(payload, dict) or set(payload) != {"extra"}:
        return None
    extra = payload.get("extra")
    if not isinstance(extra, dict) or set(extra) - PROMOTION_KEYS:
        return None
    if extra.get("trigger_i4") is not True:
        return None
    idea = extra.get("record_id")
    request_id = extra.get("production_request_record_id")
    if not isinstance(idea, str) or not REC_ID.fullmatch(idea):
        return None
    if not isinstance(request_id, str) or not REC_ID.fullmatch(request_id):
        return None
    action = extra.get("action")
    if action not in PROMOTION_ACTIONS:
        return None
    if action == "studio_promote" and extra.get("decision") != "approved":
        return None
    if action != "studio_promote" and "decision" in extra:
        return None
    if any(not isinstance(value, (str, bool)) for value in extra.values()):
        return None
    return request_id, idea


def _unpack(value, fallback):
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value) if isinstance(value, str) else fallback
    except (TypeError, ValueError):
        return fallback


def validate_recovery_promotion_authority(request_id, idea_id, *,
                                          client=None, rest=None):
    """Second check INSIDE the cross-process governor lease, before I3 writes."""
    client = client or AirtableClient()
    request_row = client.get_record(PRODUCTION_REQUESTS_TABLE, request_id)
    fields = request_row.get("fields") or {}
    if str(fields.get("Request_Status") or "") != "Submitted":
        raise ValueError("approval_not_submitted")
    if fields.get("Test_Run_ID"):
        raise ValueError("test_mode_promotion_not_allowed")
    if fields.get("Idea_Candidate") != [idea_id]:
        raise ValueError("idea_does_not_own_request")
    if fields.get("Promoted_Content_Item"):
        raise ValueError("approval_already_has_content")
    for column in ("Studio_Master_Asset_Status", "Studio_Output_Plan_Status", "Studio_Variant_Status"):
        if fields.get(column) != "Ready":
            raise ValueError("approval_media_not_ready")

    plan = _unpack(fields.get("Studio_Output_Plan_JSON"), {})
    manifest = _unpack(fields.get("Studio_Variant_Manifest_JSON"), {})
    items = plan.get("items") if isinstance(plan, dict) else None
    assets = manifest.get("assets") if isinstance(manifest, dict) else None
    if not isinstance(items, list) or not items or not isinstance(assets, list) or not assets:
        raise ValueError("saved_media_plan_missing")
    required = {str(item.get("aspect_ratio") or "") for item in items if isinstance(item, dict)}
    if not required or "" in required or not manifest.get("plan_complete"):
        raise ValueError("saved_media_plan_incomplete")
    if int(manifest.get("plan_ready_count") or 0) != int(manifest.get("plan_target_count") or -1):
        raise ValueError("saved_variants_not_ready")
    if any(not isinstance(item, dict) or
           not all((item.get("variants") or {}).get(ratio, {}).get("google_drive_file_id")
                   and (item.get("variants") or {}).get(ratio, {}).get("media_asset_record_id")
                   for ratio in required)
           for item in assets):
        raise ValueError("saved_variant_authority_incomplete")

    idea = client.get_record(SOURCE_CANDIDATES_TABLE, idea_id)
    idea_fields = idea.get("fields") or {}
    if str(idea_fields.get("Candidate_Status") or "") not in ("Generated", "Approved"):
        raise ValueError("idea_status_not_eligible")
    if idea_fields.get("Promoted_Content_Record_ID") or idea_fields.get("Content Items"):
        raise ValueError("idea_already_promoted")

    settings = load_settings()
    query = ("production_requests?airtable_record_id=eq." + request_id +
             "&select=id,idea_candidate_id,promoted_content_item_id&limit=2")
    getter = rest or (lambda path: _rest(settings, path, "GET"))
    owners = getter(query)
    if not isinstance(owners, list) or len(owners) != 1:
        raise ValueError("canonical_request_not_unique")
    owner = owners[0]
    if owner.get("promoted_content_item_id"):
        raise ValueError("canonical_content_already_promoted")
    candidate_rows = getter(
        "idea_candidates?airtable_record_id=eq." + idea_id + "&select=id&limit=2"
    )
    if not isinstance(candidate_rows, list) or len(candidate_rows) != 1:
        raise ValueError("canonical_idea_not_unique")
    if owner.get("idea_candidate_id") != candidate_rows[0].get("id"):
        raise ValueError("canonical_request_idea_mismatch")
    destinations = getter(
        "production_request_outputs?production_request_id=eq." + owner["id"] +
        "&enabled=eq.true&select=platform,output_type,aspect_ratio,platform_output_id&limit=101"
    )
    if not isinstance(destinations, list) or not destinations or len(destinations) > 100:
        raise ValueError("no_enabled_saved_outputs")
    expected = {(x.get("platform"), x.get("output_type"), x.get("aspect_ratio"))
                for x in items}
    actual = {(x.get("platform"), x.get("output_type"), x.get("aspect_ratio"))
              for x in destinations}
    if len(destinations) != len(expected) or actual != expected:
        raise ValueError("saved_plan_output_mismatch")
    if any(x.get("platform_output_id") for x in destinations):
        raise ValueError("existing_platform_link_requires_readback")
    return {"request_id": request_id, "idea_id": idea_id, "enabled": len(destinations)}
