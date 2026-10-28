"""Bounded, read-only Airtable evidence for an enrolled Chicago Reel."""
import json
import re

from rendering_review.producer import CHICAGO_PROFILE_ID, canonical_hash

SESSIONS = "tblHX3UdoNszkoquG"
OUTPUTS = "tblrlPeboBthkplH0"
CONTENT = "tblwzN9AXWvmKVKPs"
REQUESTS = "tbl75nxNi6PMUjBQE"
PROFILES = "tblNYg2QB0BmmVACy"


def one_link(fields, name):
    value = fields.get(name)
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], str) and re.fullmatch(r"rec[A-Za-z0-9]{14}", value[0]):
        return value[0]
    return None


def parsed(value, default):
    if value in (None, ""):
        return default
    return json.loads(value) if isinstance(value, str) else value


def load_evidence(client, output_id, session_id, expected_version):
    if not re.fullmatch(r"rec[A-Za-z0-9]{14}", str(output_id)) or not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", str(session_id)):
        raise ValueError("Exact output and session identities required")
    rows = client.list_records(SESSIONS, formula=f'{{Output_Record_ID}}="{output_id}"', max_records=2)
    if len(rows) != 1:
        raise ValueError("Expected exactly one authoritative review session")
    fields = rows[0].get("fields", {})
    session = parsed(fields.get("Session_JSON"), {})
    if session.get("schema") != "studio.render-review.1" or session.get("id") != session_id or fields.get("Session_ID") != session_id or session.get("output_id") != output_id:
        raise ValueError("Session identity mismatch")
    if type(expected_version) is not int or session.get("version") != expected_version or fields.get("Row_Version") != expected_version:
        raise ValueError("Stale session version")
    if session.get("profile_id") != CHICAGO_PROFILE_ID or session.get("output_type") != "Instagram Reel":
        raise ValueError("Outside Chicago Reel pilot")
    if session.get("state") not in {"ready_for_review", "discussing", "awaiting_assets", "plan_ready", "revision_failed"}:
        raise ValueError("Revision plan cannot change in current state")
    output = client.get_record(OUTPUTS, output_id)
    f = output.get("fields", {})
    hold = session.get("review_hold", {})
    if output.get("id") != output_id or not hold.get("active") or f.get("Studio_Render_Review_Hold_Active") is not True or f.get("Studio_Render_Review_Hold_ID") != hold.get("id") or f.get("Studio_Render_Review_Hold_Owner") != session_id or f.get("Studio_Render_Review_Session_ID") != session_id:
        raise ValueError("Exact authoritative review hold is required")
    if f.get("Platform_Output_Type") != "Instagram Reel" or f.get("Platform") != "Instagram":
        raise ValueError("Output platform changed")
    if (f.get("Published_At") or f.get("Platform_Post_ID") or
            f.get("Platform_Post_URL") or f.get("Platform_Media_ID") or
            f.get("Publish_Started_At") or f.get("Publish_Locked_At") or
            f.get("Publish_Locked_By") or
            str(f.get("Publish_Status") or "").strip().lower() == "published"):
        raise ValueError("Output already entered publication")
    content_id = one_link(f, "Content_Item")
    if not content_id:
        raise ValueError("Authoritative content item is ambiguous")
    content = client.get_record(CONTENT, content_id)
    cf = content.get("fields", {})
    if one_link(cf, "Content_Profile") != CHICAGO_PROFILE_ID:
        raise ValueError("Content profile does not match review session")
    profile = client.get_record(PROFILES, CHICAGO_PROFILE_ID)
    request_id = one_link(cf, "Production_Request")
    request = client.get_record(REQUESTS, request_id) if request_id else {"fields": {}}
    rf = request.get("fields", {})
    assets = parsed(rf.get("Studio_Master_Assets_JSON"), [])
    if not isinstance(assets, list):
        raise ValueError("Invalid authoritative asset inventory")
    # Only source descriptions, never signed media URLs or arbitrary credentials.
    inventory = [{k: a[k] for k in ("id", "name", "media_asset_record_id", "duration_seconds", "kind", "mime_type") if k in a}
                 for a in assets if isinstance(a, dict) and isinstance(a.get("id"), str)]
    evidence = {
        "output_id": output_id, "session_id": session_id, "session_version": expected_version,
        "profile_id": CHICAGO_PROFILE_ID, "output_type": "Instagram Reel",
        "current_attempt_id": session.get("current_attempt_id"),
        "title": cf.get("Content_Title"),
        "original_brief": {k: cf.get(k) for k in ("Idea_Summary", "Hook", "Required_Assets", "Suggested_Visuals")},
        "narration": cf.get("Voiceover_Script") or cf.get("Script") or f.get("Studio_Effective_Requested_Script"),
        "creative_settings": parsed(f.get("Studio_Creative_Settings_JSON"), {}),
        "duration_seconds": f.get("Voiceover_Duration_Seconds") or cf.get("Content_Duration"),
        "profile_requirements": {k: profile.get("fields", {}).get(k) for k in ("Brand_Voice", "Profile_Override_Guidelines", "Production_Guideline_Overrides", "Fact_Verification_Overrides")},
        "assets": inventory, "messages": session.get("messages", []),
        "prior_plan": session.get("plan"), "sources": [],
        "inspection": {"video_watched": False, "frames_inspected": False},
        "evidence_gaps": ["Fresh factual research and independent claim validation are required."] +
                         ([] if request_id else ["Production Request could not be uniquely resolved; asset inventory unavailable."]),
    }
    evidence["snapshot_hash"] = canonical_hash(evidence)
    return evidence
