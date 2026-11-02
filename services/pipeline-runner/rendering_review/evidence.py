"""Bounded, read-only Airtable evidence for an enrolled Chicago Reel."""
import json
import re

from rendering_review.producer import CHICAGO_PROFILE_ID, canonical_hash
from rendering_review.library_discovery import requested_library_names, exact_library_name_formula

SESSIONS = "tblHX3UdoNszkoquG"
OUTPUTS = "tblrlPeboBthkplH0"
CONTENT = "tblwzN9AXWvmKVKPs"
REQUESTS = "tbl75nxNi6PMUjBQE"
PROFILES = "tblNYg2QB0BmmVACy"
MEDIA = "tblSITCujCsJTNcDe"

# Read-only, fixed Chicago River pilot search. No freeform user words enter
# an Airtable formula, and no model-supplied ID becomes a rights receipt.
RIVER_SEARCH = ('AND({Media_Class}="Image",{Asset_Status}="Available",'
                '{Rights_Status}="Owned",{Active}=1,NOT({Do_Not_Use}),'
                'OR(FIND("Chicago River",{Asset Name})>0,'
                'FIND("Chicago-River",{Asset Name})>0))')
DAYPARTS = ("Sunrise", "Morning", "Golden Hour", "Afternoon", "Midday")


def _daypart(fields):
    value = fields.get("Time_Of_Day")
    return value if isinstance(value, str) else ""


def _owned_chicago_master(record, *, expected_file=None):
    if not isinstance(record, dict) or not re.fullmatch(r"rec[A-Za-z0-9]{14}", str(record.get("id") or "")):
        return False
    f = record.get("fields") or {}
    file_id = f.get("Google Drive File ID")
    if (f.get("Asset_Status") != "Available"
            or f.get("Rights_Status") != "Owned" or f.get("Active") is not True
            or f.get("Do_Not_Use") is True or
            f.get("Content_Profile") != [CHICAGO_PROFILE_ID] or
            not isinstance(file_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,}", file_id)):
        return False
    return expected_file is None or expected_file == file_id


def _owned_chicago_image(record, *, expected_file=None):
    return (_owned_chicago_master(record, expected_file=expected_file)
            and record["fields"].get("Media_Class") == "Image")


def _summary(record):
    f = record.get("fields") or {}
    # Historical descriptions can contain asset provenance/internal drive IDs.
    description = str(f.get("Asset_Description") or "").split("\n[watermarked:", 1)[0].strip()
    return {"media_asset_record_id": record["id"],
            "name": str(f.get("Asset Name") or "")[:160],
            "location": str(f.get("Location") or "")[:160],
            "time_of_day": _daypart(f),
            "description": description[:450],
            "metadata_verified": True, "frames_inspected": False}


def _library_candidates(client, already_owned, messages=None):
    candidates, ineligible = [], []
    # Exact titles from the SAVED user conversation are searched before the
    # original Chicago River pilot suggestions. This is discovery only: none
    # of these matches becomes an executable source asset or render receipt.
    requested = requested_library_names(messages)
    formula = exact_library_name_formula(requested)
    if formula:
        requested_keys = {name.casefold() for name in requested}
        rows = client.list_records(MEDIA, formula=formula, max_records=64,
                                   fields=["Asset Name", "Media_Class", "Google Drive File ID",
                                           "Asset_Status", "Rights_Status", "Active", "Do_Not_Use",
                                           "Content_Profile", "Time_Of_Day",
                                           "Asset_Description", "Location"])
        for row in rows:
            # Do not even disclose a differently owned, unavailable, disabled
            # or unverified-Drive record to the reviewing Producer.
            if not _owned_chicago_master(row) or row["id"] in already_owned:
                continue
            name = str(row.get("fields", {}).get("Asset Name") or "")
            if name.casefold() not in requested_keys or "__" in name:
                continue
            if not _owned_chicago_image(row):
                ineligible.append({"name": name, "media_asset_record_id": row["id"],
                                   "media_class": str(row["fields"].get("Media_Class") or "Unknown"),
                                   "reason": "not_a_verified_photo_source"})
                continue
            if any(item["media_asset_record_id"] == row["id"] for item in candidates):
                continue
            candidates.append({**_summary(row), "id": "library_" + row["id"],
                               "source_kind": "owned_catalog_photo",
                               "render_verified": False})
            if len(candidates) >= 24:
                return candidates, ineligible
    for daypart in DAYPARTS:
        # Prefer early sun, then fallback to daytime; bound the work and
        # eliminate duplicate 9:16/4:5/16:9 variant records by taking masters.
        formula = 'AND(' + RIVER_SEARCH[4:-1] + ',{Time_Of_Day}="' + daypart + '")'
        rows = client.list_records(MEDIA, formula=formula, max_records=45,
                                   fields=["Asset Name", "Media_Class", "Google Drive File ID",
                                           "Asset_Status", "Rights_Status", "Active", "Do_Not_Use",
                                           "Content_Profile", "Time_Of_Day",
                                           "Asset_Description", "Location"])
        for row in rows:
            if not _owned_chicago_image(row) or row["id"] in already_owned:
                continue
            name = str(row.get("fields", {}).get("Asset Name") or "")
            if "__" in name or name.lower().endswith((".mp4", ".mov")):
                continue
            if not ("river" in name.lower() or "riverwalk" in name.lower()):
                continue
            candidates.append(_summary(row))
            if len(candidates) >= 24:
                return candidates, ineligible
    return candidates, ineligible


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
    # The original request is the only source of *render-executable* asset IDs.
    # Enrich each exact linked Media Asset with its independently read time-of-day
    # and descriptive metadata: the model must not infer daylight from filenames.
    inventory = []
    linked_ids = set()
    source_ids = sorted({a.get("media_asset_record_id") for a in assets[:80]
                         if isinstance(a, dict) and isinstance(a.get("media_asset_record_id"), str)
                         and re.fullmatch(r"rec[A-Za-z0-9]{14}", a["media_asset_record_id"])})
    # One bounded authoritative read avoids ten sequential Airtable round trips
    # both before and after the model's long-running request.
    source_rows = {}
    if source_ids:
        formula = 'OR(' + ','.join('RECORD_ID()="' + i + '"' for i in source_ids) + ')'
        rows = client.list_records(MEDIA, formula=formula, max_records=80,
                                   fields=["Asset Name", "Media_Class", "Google Drive File ID",
                                           "Asset_Status", "Rights_Status", "Active", "Do_Not_Use",
                                           "Content_Profile", "Time_Of_Day",
                                           "Asset_Description", "Location"])
        source_rows = {a["id"]: a for a in rows if isinstance(a, dict) and a.get("id") in source_ids}
    for asset in assets[:80]:
        if not isinstance(asset, dict) or not isinstance(asset.get("id"), str):
            continue
        item = {k: asset[k] for k in ("id", "name", "media_asset_record_id",
                "duration_seconds", "kind", "mime_type") if k in asset}
        media_id = asset.get("media_asset_record_id")
        file_id = asset.get("google_drive_file_id")
        if (isinstance(media_id, str) and re.fullmatch(r"rec[A-Za-z0-9]{14}", media_id)
                and isinstance(file_id, str)):
            row = source_rows.get(media_id)
            if row and _owned_chicago_image(row, expected_file=file_id):
                item.update({k: v for k, v in _summary(row).items()
                             if k in ("time_of_day", "description", "location", "metadata_verified",
                                      "frames_inspected")})
                linked_ids.add(media_id)
        inventory.append(item)
    # Read the original Remotion scene order and timing without disclosing R2
    # or Drive URLs. Timecodes are frame-derived from the verified output.
    original_timeline = []
    props = parsed(f.get("Remotion_Props_JSON"), {})
    owned_by_media = {a.get("media_asset_record_id"): a
                      for a in inventory if a.get("media_asset_record_id")}
    if isinstance(props, dict) and props.get("compositionId") == "ChicagoShiningPhotoSequence":
        fps = props.get("fps")
        clips = props.get("clips")
        if type(fps) in (int, float) and 0 < fps <= 120 and isinstance(clips, list) and len(clips) <= 80:
            for clip in clips:
                if not isinstance(clip, dict):
                    original_timeline = []
                    break
                source = owned_by_media.get(clip.get("mediaAssetRecordId"))
                start, frames = clip.get("startFrame"), clip.get("durationFrames")
                if not source or type(start) is not int or type(frames) is not int or frames <= 0:
                    original_timeline = []
                    break
                original_timeline.append({
                    "start_seconds": round(start / fps, 3),
                    "end_seconds": round((start + frames) / fps, 3),
                    "asset_id": source["id"], "name": source.get("name", ""),
                    "time_of_day": source.get("time_of_day", "Unknown")})
    # Wider catalog suggestions remain *advisory* until the separate immutable
    # plan adapter verifies rights, a usable crop, and their exact ownership.
    # Never let a catalog photo's ID masquerade as a request-linked render asset.
    library, library_ineligible = _library_candidates(client, linked_ids, session.get("messages", []))
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
        "assets": inventory, "original_timeline": original_timeline,
        "library_candidates": library,
        "library_ineligible": library_ineligible,
        "messages": session.get("messages", []),
        "prior_plan": session.get("plan"), "sources": [],
        "inspection": {"video_watched": False, "frames_inspected": False},
        "evidence_gaps": ["Fresh factual research and independent claim validation are required."] +
                         ([] if request_id else ["Production Request could not be uniquely resolved; asset inventory unavailable."]),
    }
    evidence["snapshot_hash"] = canonical_hash(evidence)
    return evidence
