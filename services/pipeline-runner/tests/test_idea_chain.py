from config import StageRequest
from i2.email_builder import candidate_card, review_action_url
from i3.decisions import carousel_fields, config_approve_fields, reject_fields, video_fields
from i4.processor import _content_item_fields
from idea.mapping import normalize_content_type, resolve_tri_state, route_for_payload, split_platforms
from idea.prompt import build_i1_prompt
from stages.i3 import run as run_i3
from stages.i4 import run as run_i4
from stages.registry import STAGE_NAMES, is_implemented


def test_idea_stages_are_registered():
    for name in ("i1", "i2", "i3", "i4"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_i1_prompt_keeps_make_format_mix():
    prompt = build_i1_prompt({"id": "recPROFILE", "fields": {"Profile_Name": "Chicago"}}, remaining_slots=5, quality="Highest Quality")
    assert "Generate exactly 5 idea candidate" in prompt
    assert "Vertical Short Video" in prompt
    assert "Do not use \"Reel\"" in prompt
    assert "Highest Quality" in prompt
    assert '"ideas"' in prompt


def test_i3_routes_match_make():
    assert route_for_payload({"action": "carousel_form", "record_id": "rec1"}) == "carousel_form"
    assert route_for_payload({"action": "carousel_submit", "record_id": "rec1"}) == "carousel_submit"
    assert route_for_payload({"action": "video_form", "record_id": "rec1"}) == "video_form"
    assert route_for_payload({"action": "video_submit", "record_id": "rec1"}) == "video_submit"
    assert route_for_payload({"decision": "approved", "production_content_type": "Feed Post", "record_id": "rec1"}) == "approve_with_config"
    assert route_for_payload({"decision": "approved", "record_id": "rec1"}) == "approve_quick"
    assert route_for_payload({"decision": "tune", "record_id": "rec1"}) == "tune"
    assert route_for_payload({"decision": "rejected", "record_id": "rec1"}) == "rejected"
    assert route_for_payload({"decision": "deleted", "record_id": "rec1"}) == "deleted"
    assert route_for_payload({"decision": "approved"}) == "missing_record"


def test_i3_platform_and_type_aliases():
    assert split_platforms("All") == ["Instagram", "TikTok", "Facebook", "YouTube"]
    assert split_platforms("IG") == ["Instagram"]
    assert normalize_content_type("Reel") == "Vertical Short Video"
    assert normalize_content_type("Static Image", "YouTube") == "Thumbnail / Promo Still"
    assert normalize_content_type("Slideshow") == "Carousel"


def test_i3_carousel_and_video_fields():
    now = "2026-08-24T04:00:00.000Z"
    carousel = carousel_fields(
        {
            "production_platforms": "All",
            "carousel_image_mode": "Make AI Generated",
            "carousel_slide_count": "7",
            "include_voiceover": "No",
        },
        now=now,
    )
    assert carousel["Candidate_Status"] == "Approved"
    assert carousel["Production_Content_Type"] == "Carousel"
    assert carousel["Production_Target_Platforms"] == ["Instagram", "TikTok", "Facebook", "YouTube"]
    assert carousel["Production_Carousel_Slide_Count"] == 7
    assert carousel["Production_Include_Voiceover"] == "No"

    video = video_fields(
        {
            "production_content_type": "Reel",
            "production_platforms": "Instagram",
            "video_duration": "Custom",
            "custom_video_duration": "45",
            "video_clip_count": "Auto",
            "voiceover_tail_seconds": "3",
        },
        now=now,
    )
    assert video["Production_Content_Type"] == "Vertical Short Video"
    assert video["Production_Video_Duration"] == 45
    assert video["Production_Video_Clip_Count"] is None
    assert video["Voiceover_Tail_Seconds"] == 3

    config = config_approve_fields(
        {"production_content_type": "Feed Post", "production_platforms": "Instagram,Facebook"},
        now=now,
    )
    assert config["Production_Content_Type"] == "Feed Post"
    assert reject_fields(now=now)["Candidate_Status"] == "Rejected"


def test_i4_resolves_profile_defaults():
    candidate = {
        "id": "recIDEA",
        "fields": {
            "Candidate_Title": "Riverwalk at dusk",
            "Idea_Summary": "A quiet walk.",
            "Production_Content_Type": "Carousel",
            "Production_Include_Voiceover": "Use Profile Default",
            "Production_Include_Background_Music": "No",
            "Production_Include_Thumbnail": "Yes",
            "Production_Carousel_Image_Mode": "Make AI Generated",
            "Production_Carousel_Slide_Count": 5,
            "Content_Profile": ["recPROFILE"],
        },
    }
    profile = {"fields": {"Include_Voiceover": True, "Include_Background_Music": True, "Include_Thumbnail": False}}
    fields = _content_item_fields(candidate, profile)
    assert fields["Include_Voiceover"] == "Yes"
    assert fields["Include_Background_Music"] == "No"
    assert fields["Include_Thumbnail"] == "Yes"
    assert fields["Carousel_Image_Mode"] == "Make AI Generated"
    assert fields["Content_Status"] == "Idea Approved"
    assert resolve_tri_state("Yes", False) == "Yes"
    assert resolve_tri_state("", False) == "No"


def test_i2_buttons_use_python_hook():
    html = candidate_card(
        {"id": "recCAND", "fields": {"Candidate_Title": "Test idea"}},
        review_url="https://pipeline.chicagoshining.com/hooks/i3/token",
    )
    assert "https://pipeline.chicagoshining.com/hooks/i3/token?record_id=recCAND&amp;decision=approved" in html
    assert "action=carousel_form" in html
    assert "action=video_form" in html
    assert review_action_url("https://example/hooks/i3/t", decision="tune", record_id="rec1").endswith("decision=tune&record_id=rec1") or "record_id=rec1" in review_action_url("https://example/hooks/i3/t", decision="tune", record_id="rec1")


def test_i2_skips_studio_managed_candidates():
    from i2.processor import is_studio_managed_candidate

    assert is_studio_managed_candidate(
        {"id": "recPR", "fields": {"Production Requests": ["recPR1"]}}
    )
    assert is_studio_managed_candidate(
        {"id": "recEZ", "fields": {"Production_Config_Notes": "origin=ez-wizard; ez-input=finished-video"}}
    )
    assert is_studio_managed_candidate(
        {"id": "recAUTO", "fields": {"Production_Config_Notes": "origin=autonomous\nmedia_asset_ids=recM"}}
    )
    assert not is_studio_managed_candidate(
        {"id": "recI1", "fields": {"Candidate_Title": "Daily batch idea", "Idea_Batch": ["recBATCH"]}}
    )


def test_i3_and_i4_skip_without_airtable():
    missing = run_i3(StageRequest(extra={"decision": "approved"}))
    assert missing.status == "skipped"
    assert missing.details["run"]["reason"] == "missing_record_id"

    unknown = run_i3(StageRequest(extra={"record_id": "recFAKE", "decision": "nope"}))
    assert unknown.status == "skipped"
    assert unknown.details["run"]["reason"] == "unknown_decision"

    i4_missing = run_i4(StageRequest())
    assert i4_missing.status == "skipped"
    assert i4_missing.details["run"]["reason"] == "missing_record_id"
