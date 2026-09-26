"""I1 processor — generate Idea Candidates and daisy-chain I2."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_PROFILES_TABLE, SOURCE_CANDIDATES_TABLE
from carousel.timeutil import chicago_now
from i1.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from i1.openai_ideas import generate_ideas
from idea.chain import trigger_next
from idea.constants import DEFAULT_CONTENT_PROFILE_ID
from idea.mapping import parse_int
from idea.prompt import build_i1_prompt
from render.fields import field, field_str


def _as_select_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").strip()
    return [text] if text else []


PHOTO_LISTEN_FORMAT_RANGES: dict[str, tuple[int, int]] = {
    "Carousel": (5, 8),
    "Photo Set": (5, 10),
    "Feed Post": (1, 4),
    "Vertical Short Video": (5, 10),
}


def _auto_photo_listen_fields(idea: dict[str, Any]) -> dict[str, Any]:
    formats = _as_select_list(idea.get("suggested_format"))
    content_type = next((value for value in formats if value in PHOTO_LISTEN_FORMAT_RANGES), "")
    if not content_type:
        return {}
    minimum, maximum = PHOTO_LISTEN_FORMAT_RANGES[content_type]
    return {
        "Production_Content_Type": content_type,
        "Production_Carousel_Image_Mode": "Manual Upload",
        "Production_Carousel_Slide_Count_Mode": "Target range",
        "Production_Carousel_Slide_Count_Min": minimum,
        "Production_Carousel_Slide_Count_Max": maximum,
        "Production_Carousel_Slide_Count": maximum,
        "Studio_Photo_Wait_Status": "Waiting",
    }


def _candidate_fields(
    idea: dict[str, Any],
    *,
    profile_id: str,
    batch_id: str | None,
    test_run_id: str | None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "Batch_Date": chicago_now().strftime("%Y-%m-%d"),
        "Candidate_Status": "Generated",
        "Candidate_Title": str(idea.get("candidate_title") or "").strip(),
        "Idea_Summary": str(idea.get("idea_summary") or "").strip(),
        "Hook": str(idea.get("hook") or "").strip(),
        "Content_Themes": _as_select_list(idea.get("content_themes")),
        "Suggested_Format": _as_select_list(idea.get("suggested_format")),
        "Suggested_Platforms": _as_select_list(idea.get("suggested_platforms")),
        "Primary_Location": str(idea.get("primary_location") or "").strip(),
        "Neighborhood_or_Area": str(idea.get("neighborhood_or_area") or "").strip(),
        "Suggested_Visuals": str(idea.get("suggested_visuals") or "").strip(),
        "Required_Assets": str(idea.get("required_assets") or "").strip(),
        "Why_This_Should_Work": str(idea.get("why_this_should_work") or "").strip(),
        "Duplicate_Risk": str(idea.get("duplicate_risk") or "Low").strip() or "Low",
        "Content_Profile": [profile_id],
        **_auto_photo_listen_fields(idea),
    }
    score = parse_int(idea.get("priority_score"))
    if score is not None:
        fields["Priority_Score"] = score
    if batch_id:
        fields["Idea_Batch"] = [batch_id]
    if test_run_id:
        fields["Test_Run_ID"] = test_run_id
    return fields


def process_request(
    *,
    profile_record_id: str | None,
    batch_record_id: str | None = None,
    requested_count: int | None = None,
    quality: str | None = None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_i2: bool = True,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "profile_record_id": profile_record_id or DEFAULT_CONTENT_PROFILE_ID,
        "batch_record_id": batch_record_id,
        "test_run_id": test_run_id,
    }
    client = AirtableClient()
    profile = client.get_record(CONTENT_PROFILES_TABLE, preview["profile_record_id"])
    if not profile:
        return {"processed": False, "reason": "profile_not_found", **preview}

    override_count = parse_int(field(profile, "Manual_Idea_Count_Override"))
    daily_limit = parse_int(field(profile, "Daily_Idea_Limit"), 5) or 5
    remaining = max(0, parse_int(requested_count) or override_count or daily_limit)
    quality_mode = (quality or field_str(profile, "Manual_Idea_Quality_Override") or "Balanced").strip()
    preview["requested_count"] = remaining
    preview["quality"] = quality_mode
    if remaining < 1:
        return {"processed": False, "reason": "no_remaining_slots", **preview}

    prompt = build_i1_prompt(profile, remaining_slots=remaining, quality=quality_mode)
    if dry_run:
        return {"processed": False, "dry_run": True, "prompt": prompt, **preview}

    generated = generate_ideas(prompt)
    ideas = list((generated.get("parsed") or {}).get("ideas") or [])[:remaining]
    preview["openai_idea_count"] = len(ideas)
    created_ids: list[str] = []
    for idea in ideas:
        if not str(idea.get("candidate_title") or "").strip():
            continue
        created = client.create_records(
            SOURCE_CANDIDATES_TABLE,
            [
                _candidate_fields(
                    idea,
                    profile_id=profile["id"],
                    batch_id=batch_record_id,
                    test_run_id=test_run_id,
                )
            ],
            typecast=True,
        )
        if created:
            created_ids.append(created[0]["id"])

    preview["created_record_ids"] = created_ids
    if not created_ids:
        return {"processed": False, "reason": "no_ideas_created", **preview}

    next_result = None
    from i2.constants import I2_EMAIL_ENABLED

    if trigger_i2 and I2_EMAIL_ENABLED:
        from i2.processor import process_request as process_i2

        next_result = trigger_next(
            "i2",
            {"source": "I1", "event": "ideas_generated"},
            python_call=lambda: process_i2(test_run_id=test_run_id, dry_run=False),
        )
    return {
        "processed": True,
        "created_count": len(created_ids),
        "i2": next_result,
        **preview,
    }
