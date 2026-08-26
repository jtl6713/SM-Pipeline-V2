from carousel.formulas import (
    c8_existing_output_formula,
    c9_slides_for_output_formula,
    exact_record_formula,
    matches_test_run,
)
from carousel.mapping import (
    c2_should_generate,
    c3_include_slide,
    c3b_action_fields,
    c3b_triggers_c4,
    c4_route,
    c5_should_regenerate,
    c7_can_finalize,
    c8_group_key,
    c8_include_slide,
    image_size_for_ratio,
    platform_output_mapping,
    slide_is_resolved,
)
from sai1.prompt import build_themer_prompt


def test_test_run_identity():
    assert matches_test_run("", "")
    assert matches_test_run(None, None)
    assert not matches_test_run("WAVE5", "")
    assert matches_test_run("WAVE5", "WAVE5")
    assert not matches_test_run("WAVE5", "OTHER")
    assert "{Test_Run_ID}=BLANK()" in exact_record_formula("recABC")
    assert '{Test_Run_ID}="WAVE5"' in exact_record_formula("recABC", "WAVE5")


def test_image_size_and_platform_mapping():
    assert image_size_for_ratio("16:9") == "1536x1024"
    assert image_size_for_ratio("1:1") == "1024x1024"
    assert image_size_for_ratio("4:5") == "1024x1536"
    assert platform_output_mapping("Instagram") == ("Carousel", "Instagram Carousel")
    assert platform_output_mapping("Facebook") == ("Photo Set", "Facebook Photo Set")
    assert platform_output_mapping("TikTok") == ("Photo Set", "TikTok Photo Set")
    assert platform_output_mapping("YouTube") == ("Vertical Short Video", "YouTube Short")
    assert c8_group_key("recParent", "Instagram", "4:5") == "recParent|Instagram|4:5"


def test_c2_c3_c5_filters():
    generate = {
        "fields": {
            "Image Generation Mode": "Make AI Generated",
            "AI Prompt": "Lincoln Park sunrise",
        }
    }
    assert c2_should_generate(generate)
    assert not c2_should_generate({"fields": {"Image Generation Mode": "Manual Upload", "AI Prompt": "x"}})
    assert not c2_should_generate({
        "fields": {
            "Image Generation Mode": "Make AI Generated",
            "AI Prompt": "Lincoln Park sunrise",
            "AI Image URL": "https://drive.google.com/uc?id=already",
        }
    })
    assert c3_include_slide({"fields": {"Review Status": "Generated", "Current Image URL": "https://x"}})
    assert c3_include_slide({"fields": {"Review Status": "Replacement Generated", "Current Image URL": "https://x"}})
    assert not c3_include_slide({"fields": {"Review Status": "Approved", "Current Image URL": "https://x"}})
    assert c5_should_regenerate(
        {"fields": {"Replacement Requested": True, "Review Status": "Rejected - Regenerate"}}
    )
    assert not c5_should_regenerate(
        {"fields": {"Replacement Requested": False, "Review Status": "Rejected - Regenerate"}}
    )


def test_c3b_actions_and_c4_routes():
    approved = c3b_action_fields("approve", timestamp="2026-08-23 22:00")
    assert approved["Review Status"] == "Approved"
    assert approved["Approved For Final"] is False
    regen = c3b_action_fields("try_ai", timestamp="2026-08-23 22:00")
    assert regen["Review Status"] == "Rejected - Regenerate"
    assert regen["Image Generation Mode"] == "Make AI Generated"
    notes = c3b_action_fields("ai_submit", notes="more boats", timestamp="x")
    assert notes["Replacement Prompt"] == "more boats"
    manual = c3b_action_fields("manual_replace", timestamp="x")
    assert manual["Review Status"] == "Rejected - Manual Replace"
    assert manual["Replacement Requested"] is True
    assert c3b_triggers_c4("approve")
    assert c3b_triggers_c4("try_ai")
    assert not c3b_triggers_c4("manual_replace")
    assert c4_route({"fields": {"Review Status": "Approved", "Approved For Final": False}}) == "approved"
    assert c4_route({"fields": {"Review Status": "Approved", "Approved For Final": True}}) is None
    assert c4_route({"fields": {"Review Status": "Rejected - Delete", "Deleted From Carousel": False}}) == "delete"
    assert c4_route({"fields": {"Review Status": "Rejected - Regenerate", "Replacement Requested": False}}) == "regenerate"


def test_c7_gate_and_c8_include():
    deleted = {"fields": {"Deleted From Carousel": True}}
    pending = {"fields": {"Approved For Final": False, "Final Image URL": ""}}
    ready = {
        "fields": {
            "Approved For Final": True,
            "Final Image URL": "https://x",
            "Final Google Drive File ID": "file1",
            "Review Status": "Final Approved",
            "Deleted From Carousel": False,
        }
    }
    assert slide_is_resolved(deleted)
    assert not slide_is_resolved(pending)
    assert slide_is_resolved(ready)
    assert c7_can_finalize([deleted, ready])
    assert not c7_can_finalize([deleted, pending])
    assert c8_include_slide(ready)
    assert not c8_include_slide(deleted)


def test_c8_c9_formulas():
    formula = c8_existing_output_formula(content_id="90", platform="Instagram", ratio="4:5")
    assert 'FIND(",90,",' in formula
    assert '{Platform}="Instagram"' in formula
    assert "{Test_Run_ID}=BLANK()" in formula
    slides = c9_slides_for_output_formula("recOUT", "WAVE5")
    assert 'FIND("recOUT"' in slides
    assert "{Platform Output}" in slides
    assert '{Test_Run_ID}="WAVE5"' in slides


def test_sai1_prompt_includes_request_fields():
    prompt = build_themer_prompt(
        title="7 Things To Do in Chicago",
        covered_text="1. Cloud Gate",
        needed=2,
        total=3,
    )
    assert "7 Things To Do in Chicago" in prompt
    assert "1. Cloud Gate" in prompt
    assert "REQUESTED COUNT" in prompt
    assert "\n2\n" in prompt or "2\n" in prompt
    assert "TOTAL SLIDE COUNT" in prompt
