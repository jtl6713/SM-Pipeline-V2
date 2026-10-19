from studio_produce.thumbnail_prompt import build_finished_thumbnail_prompt
from its1.prompt import build_timed_script_prompt
from sai1.prompt import build_themer_prompt


def test_same_profile_shared_guidance_steers_both_formats():
    creative = {
        "shared_direction": "Look and sound like a local city guide",
        "thumbnail_instructions": "Use restrained architectural details",
        "narration_instructions": "Use short conversational hooks",
    }
    thumbnail = build_finished_thumbnail_prompt(
        {"fields": {"Requested_Title": "River lights"}},
        None,
        creative_guidance=creative,
    )
    narration = build_timed_script_prompt(
        title="River lights", summary="Night scene", location="Riverwalk",
        market="Chicago", catalog=[], creative_guidance=creative,
    )
    assert "local city guide" in thumbnail
    assert "local city guide" in narration
    assert "architectural details" in thumbnail
    assert "architectural details" not in narration
    assert "conversational hooks" in narration
    assert "conversational hooks" not in thumbnail
    assert "platform cover" in thumbnail


def test_blank_fields_preserve_original_prompts_and_sai1_voice_style():
    before = build_finished_thumbnail_prompt({}, None)
    assert build_finished_thumbnail_prompt({}, None, creative_guidance={}) == before
    prompt = build_themer_prompt(
        title="Coastal walk", covered_text="", needed=2, total=2, market="Miami",
        creative_guidance={"narration_instructions": "Warm concise local tone"},
    )
    assert "Warm concise local tone" in prompt
