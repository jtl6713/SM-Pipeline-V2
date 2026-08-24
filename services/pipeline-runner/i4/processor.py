"""I4 processor — promote an approved Idea Candidate to a Content Item."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import (
    CONTENT_ITEMS_TABLE,
    CONTENT_PROFILES_TABLE,
    PRODUCTION_PROFILES_TABLE,
    SOURCE_CANDIDATES_TABLE,
)
from i4.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from idea.constants import DEFAULT_VOICEOVER_TAIL_SECONDS
from idea.mapping import parse_number, resolve_tri_state
from render.fields import field, field_str, first_linked_id


def _content_item_fields(
    candidate: dict[str, Any],
    production_profile: dict[str, Any] | None,
) -> dict[str, Any]:
    voiceover = resolve_tri_state(
        field_str(candidate, "Production_Include_Voiceover"),
        field(production_profile, "Include_Voiceover") if production_profile else None,
    )
    music = resolve_tri_state(
        field_str(candidate, "Production_Include_Background_Music"),
        field(production_profile, "Include_Background_Music") if production_profile else None,
    )
    thumbnail = resolve_tri_state(
        field_str(candidate, "Production_Include_Thumbnail"),
        field(production_profile, "Include_Thumbnail") if production_profile else None,
    )
    content_type = field_str(candidate, "Production_Content_Type")
    profile_name = field_str(production_profile, "Production_Profile_Name") if production_profile else ""
    profile_code = field_str(production_profile, "Production_Profile_ID") if production_profile else ""
    tail = parse_number(field(candidate, "Voiceover_Tail_Seconds"), DEFAULT_VOICEOVER_TAIL_SECONDS)
    notes = (
        f"Promoted from Idea Candidate: {candidate['id']}\n"
        f"{field_str(candidate, 'Production_Config_Notes')}\n"
        f"Production Profile: {profile_name} ({profile_code})\n"
        f"Reviewer selections: Voiceover={field_str(candidate, 'Production_Include_Voiceover') or 'Use Profile Default'}; "
        f"Background Music={field_str(candidate, 'Production_Include_Background_Music') or 'Use Profile Default'}; "
        f"Thumbnail={field_str(candidate, 'Production_Include_Thumbnail') or 'Use Profile Default'}\n"
        f"Resolved production values: Voiceover={voiceover}; Background Music={music}; Thumbnail={thumbnail}\n"
        f"Video options: Duration={field(candidate, 'Production_Video_Duration')} seconds; "
        f"Clip Count={field(candidate, 'Production_Video_Clip_Count')}; Voiceover Tail={tail} seconds.\n"
        "Carousel fields are only copied when Production_Content_Type=Carousel."
    )
    fields: dict[str, Any] = {
        "Hook": field_str(candidate, "Hook"),
        "Test_Run_ID": field_str(candidate, "Test_Run_ID") or None,
        "Content_Type": content_type,
        "Idea_Summary": field_str(candidate, "Idea_Summary"),
        "Content_Title": field_str(candidate, "Candidate_Title"),
        "Render_Status": "Not Ready",
        "Content_Status": "Idea Approved",
        "Content_Themes": field(candidate, "Content_Themes"),
        "Internal_Notes": notes,
        "Priority_Score": field(candidate, "Priority_Score"),
        "Reviewer_Notes": field_str(candidate, "Reviewer_Notes") or None,
        "Required_Assets": field_str(candidate, "Required_Assets"),
        "Content_Duration": field(candidate, "Production_Video_Duration"),
        "Primary_Location": field_str(candidate, "Primary_Location"),
        "Source_Candidate": [candidate["id"]],
        "Thumbnail_Status": "Not Started" if thumbnail == "Yes" else "Not Needed",
        "Video_Clip_Count": field(candidate, "Production_Video_Clip_Count"),
        "Voiceover_Status": "Not Started" if voiceover == "Yes" else "Not Needed",
        "Include_Thumbnail": thumbnail,
        "Include_Voiceover": voiceover,
        "Suggested_Visuals": field_str(candidate, "Suggested_Visuals"),
        "Neighborhood_or_Area": field_str(candidate, "Neighborhood_or_Area"),
        "Voiceover_Tail_Seconds": tail,
        "Include_Background_Music": music,
    }
    profile_id = first_linked_id(field(candidate, "Content_Profile"))
    if profile_id:
        fields["Content_Profile"] = [profile_id]
    if content_type == "Carousel":
        fields["Carousel_Image_Mode"] = field_str(candidate, "Production_Carousel_Image_Mode") or None
        fields["Carousel_Slide_Count"] = field(candidate, "Production_Carousel_Slide_Count")
        fields["Carousel_Target_Platforms"] = field(candidate, "Production_Target_Platforms")
    return {key: value for key, value in fields.items() if value is not None and value != ""}


def process_request(*, record_id: str | None, dry_run: bool = False) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "record_id": record_id,
    }
    if not record_id:
        return {"processed": False, "reason": "missing_record_id", **preview}

    client = AirtableClient()
    candidate = client.get_record(SOURCE_CANDIDATES_TABLE, record_id)
    status = field_str(candidate, "Candidate_Status")
    already = field_str(candidate, "Promoted_Content_Record_ID") or first_linked_id(
        field(candidate, "Content Items")
    )
    preview["candidate_status"] = status
    if status != "Approved":
        return {"processed": False, "reason": "not_approved", **preview}
    if already:
        return {"processed": False, "reason": "already_promoted", "content_item_id": already, **preview}

    profile_id = first_linked_id(field(candidate, "Content_Profile"))
    production_profile = None
    if profile_id:
        content_profile = client.get_record(CONTENT_PROFILES_TABLE, profile_id)
        production_id = first_linked_id(field(content_profile, "Production_Profile"))
        if production_id:
            production_profile = client.get_record(PRODUCTION_PROFILES_TABLE, production_id)
            preview["production_profile_id"] = production_id

    if dry_run:
        return {
            "processed": False,
            "dry_run": True,
            "content_item_preview": _content_item_fields(candidate, production_profile),
            **preview,
        }

    created = client.create_records(
        CONTENT_ITEMS_TABLE,
        [_content_item_fields(candidate, production_profile)],
        typecast=True,
    )
    if not created:
        return {"processed": False, "reason": "create_failed", **preview}
    content_item = created[0]
    client.update_record(
        SOURCE_CANDIDATES_TABLE,
        candidate["id"],
        {
            "Candidate_Status": "Promoted",
            "Content Items": [content_item["id"]],
            "Promoted_Content_Record_ID": content_item["id"],
        },
        typecast=True,
    )
    return {
        "processed": True,
        "content_item_id": content_item["id"],
        **preview,
    }
