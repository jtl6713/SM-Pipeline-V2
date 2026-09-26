from config import StageRequest
from i2.email_builder import candidate_card, review_action_url
from i3.decisions import carousel_fields, config_approve_fields, reject_fields, video_fields
from i4.processor import _content_item_fields
from i1.processor import _candidate_fields
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


def test_i2_skips_email_when_disabled(monkeypatch):
    from i2 import processor as i2p

    class FakeAirtable:
        def list_records(self, *_args, **_kwargs):
            return [{"id": "recI1", "fields": {"Candidate_Title": "Daily batch idea"}}]

        def update_record(self, *_args, **_kwargs):
            raise AssertionError("disabled I2 must not stamp Sent for Review")

    class FakeGmail:
        def send_html(self, **_kwargs):
            raise AssertionError("disabled I2 must not send Gmail")

    monkeypatch.setattr(
        i2p,
        "load_settings",
        lambda: {
            "i2_email_enabled": False,
            "i2_email_to": "chicagoshining@gmail.com",
            "public_base_url": "https://pipeline.chicagoshining.com",
            "i3_webhook_token": "token",
            "i3_webhook_url": "",
        },
    )
    monkeypatch.setattr(i2p, "AirtableClient", FakeAirtable)
    monkeypatch.setattr(i2p, "GmailClient", FakeGmail)

    result = i2p.process_request()
    assert result["processed"] is False
    assert result["reason"] == "email_disabled"
    assert result["candidate_ids"] == ["recI1"]


def test_i1_does_not_chain_i2_when_email_disabled(monkeypatch):
    from i1 import processor as i1p

    class FakeAirtable:
        def get_record(self, *_args, **_kwargs):
            return {"id": "recPROFILE", "fields": {"Daily_Idea_Limit": 1}}

        def create_records(self, *_args, **_kwargs):
            return [{"id": "recNEW"}]

    def boom_trigger(*_args, **_kwargs):
        raise AssertionError("I1 must not daisy-chain I2 while idea emails are off")

    monkeypatch.setattr(i1p, "AirtableClient", FakeAirtable)
    monkeypatch.setattr(
        i1p,
        "generate_ideas",
        lambda _prompt: {"parsed": {"ideas": [{"candidate_title": "Riverwalk at dusk"}]}},
    )
    monkeypatch.setattr(i1p, "load_settings", lambda: {"i2_email_enabled": False})
    monkeypatch.setattr(i1p, "trigger_next", boom_trigger)

    result = i1p.process_request(profile_record_id="recPROFILE", trigger_i2=True)
    assert result["processed"] is True
    assert result["created_count"] == 1
    assert result["i2"] is None


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


def test_i1_generated_photo_capable_ideas_auto_listen_for_library_photos():
    carousel = _candidate_fields(
        {
            "candidate_title": "Pilsen wall details",
            "suggested_format": ["Carousel"],
            "suggested_platforms": ["Instagram"],
        },
        profile_id="recPROFILE",
        batch_id=None,
        test_run_id=None,
    )
    assert carousel["Production_Content_Type"] == "Carousel"
    assert carousel["Production_Carousel_Image_Mode"] == "Manual Upload"
    assert carousel["Production_Carousel_Slide_Count_Mode"] == "Target range"
    assert carousel["Production_Carousel_Slide_Count_Min"] == 5
    assert carousel["Production_Carousel_Slide_Count_Max"] == 8
    assert carousel["Studio_Photo_Wait_Status"] == "Waiting"

    short = _candidate_fields(
        {
            "candidate_title": "Brooklyn Bridge blue hour",
            "suggested_format": ["Vertical Short Video"],
        },
        profile_id="recPROFILE",
        batch_id=None,
        test_run_id=None,
    )
    assert short["Production_Content_Type"] == "Vertical Short Video"
    assert short["Studio_Photo_Wait_Status"] == "Waiting"

    text_only = _candidate_fields(
        {
            "candidate_title": "Chicago hot take",
            "suggested_format": ["Thread"],
        },
        profile_id="recPROFILE",
        batch_id=None,
        test_run_id=None,
    )
    assert "Studio_Photo_Wait_Status" not in text_only
    assert "Production_Carousel_Image_Mode" not in text_only
