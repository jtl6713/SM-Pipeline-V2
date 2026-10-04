from m1.eligibility import stale_render_formula, uses_obsolete_url
from p1.eligibility import content_status_for, effective_options, initial_eligibility_reason, pick_forced, recheck_formula
from stages.registry import STAGE_NAMES, is_implemented


def test_m1_and_p1_are_registered():
    for name in ("m1", "p1"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_m1_stale_formula_requires_obsolete_url():
    formula = stale_render_formula("https://render.example")
    assert '{Test_Run_ID}=BLANK()' in formula
    assert '{Render_Status}="Rendering"' in formula
    assert 'FIND("https://render.example",{Remotion_Status_URL})=0' in formula
    assert 'FIND("https://render.example",{Render_Server_URL})=0' in formula


def test_m1_uses_obsolete_url():
    current = "https://render.example"
    assert uses_obsolete_url(
        {
            "Remotion_Status_URL": "https://old.example/status",
            "Render_Server_URL": "https://old.example",
        },
        current,
    )
    assert not uses_obsolete_url(
        {
            "Remotion_Status_URL": "https://render.example/status/abc",
            "Render_Server_URL": "https://render.example",
        },
        current,
    )


def test_p1_initial_eligibility():
    ready = {
        "id": "recITEM",
        "fields": {
            "Content_Profile": ["recPROFILE"],
            "Content_Title": "Title",
            "Idea_Summary": "Summary",
        },
    }
    assert initial_eligibility_reason(ready) is None
    assert initial_eligibility_reason({**ready, "id": ""}) == "missing_item"
    assert initial_eligibility_reason({"id": "recITEM", "fields": {}}) == "missing_profile"
    assert initial_eligibility_reason({"id": "recITEM", "fields": {**ready["fields"], "Script": "done"}}) == "already_has_script"
    assert initial_eligibility_reason({"id": "recITEM", "fields": {**ready["fields"], "Caption": "done"}}) == "already_has_caption"


def test_p1_effective_options_and_status():
    item = {"fields": {}}
    production = {
        "fields": {
            "Default_Duration": 24,
            "Default_Video_Clip_Count": 6,
            "Default_Carousel_Slide_Count": 5,
            "Default_Carousel_Image_Mode": "single",
            "Include_Voiceover": True,
            "Include_Background_Music": False,
            "Include_Thumbnail": True,
            "Aspect_Ratio": "9:16",
        }
    }
    options = effective_options(item, production)
    assert options["duration"] == 24
    assert options["clip_count"] == 6
    assert options["include_voiceover"] == "Yes"
    assert options["include_music"] == "No"
    assert options["include_thumbnail"] == "Yes"
    assert options["voiceover_tail_seconds"] == 2
    assert options["target_voiceover_duration"] == 22
    explicit = effective_options(
        {"fields": {"Content_Duration": 30, "Include_Voiceover": "Yes", "Voiceover_Duration_Seconds": 15}},
        production,
    )
    assert explicit["target_voiceover_duration"] == 15
    floored = effective_options(
        {"fields": {"Content_Duration": 30, "Include_Voiceover": "Yes", "Voiceover_Duration_Seconds": 1}},
        production,
    )
    assert floored["target_voiceover_duration"] == 4
    assert explicit["voiceover_tail_seconds"] == 15
    assert content_status_for(options) == "Ready for Voiceover"
    assert content_status_for({"include_voiceover": "No", "include_thumbnail": "Yes"}) == "Ready for Thumbnail"
    assert content_status_for({"include_voiceover": "No", "include_thumbnail": "No"}) == "Script Generated"


def test_p1_force_exact_and_recheck():
    assert pick_forced("Force exact", "Keep this", "generated") == "Keep this"
    assert pick_forced("AI decides", "Keep this", "generated") == "generated"
    formula = recheck_formula("recITEM")
    assert "RECORD_ID()='recITEM'" in formula
    assert '{Content_Status}="Idea Approved"' in formula
    assert '{Script}=BLANK()' in formula
