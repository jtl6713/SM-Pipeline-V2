from p3.formulas import (
    p3_duplicate_output_formula,
    p3_legacy_item_formula,
    p3_legacy_recheck_formula,
    p3_mapping_formula,
    p3_seeded_outputs_formula,
    p3_studio_parent_formula,
)
from p3.helpers import (
    build_studio_enrichment_fields,
    csv_has,
    mapping_matches,
    parent_mark_fields,
    parent_media_ready,
    resolve_effective_formats,
    resolve_effective_platforms,
    studio_asset_selection_status,
    studio_output_status,
)


def test_studio_parent_formula_pins_record_and_package_gates():
    formula = p3_studio_parent_formula("recP3PARENT", "wave4")
    assert 'RECORD_ID()="recP3PARENT"' in formula
    assert '{Test_Run_ID}="wave4"' in formula
    assert "{Production_Request}!=BLANK()" in formula
    assert "NOT({Studio_Is_Output_Work_Item})" in formula
    assert '{Content_Status}="Thumbnail Ready"' in formula
    assert '{Include_Voiceover}="No"' in formula


def test_legacy_item_formula_accepts_child_work_items():
    formula = p3_legacy_item_formula("recLEGACY")
    assert 'RECORD_ID()="recLEGACY"' in formula
    assert "{Production_Request}=BLANK()" in formula
    assert "{Studio_Is_Output_Work_Item}=TRUE()" in formula


def test_seeded_outputs_formula_uses_content_id():
    formula = p3_seeded_outputs_formula("95")
    assert 'FIND(",95,",' in formula
    assert '{Output_Status}="Planned"' in formula
    assert "{Production_Request_Output}!=BLANK()" in formula


def test_mapping_formula_treats_youtube_shorts_as_youtube():
    formula = p3_mapping_formula("YouTube Shorts,TikTok", "Vertical Short Video")
    assert '{Platform}="YouTube"' in formula
    assert "YouTube Shorts" in formula
    assert "Vertical Short Video" in formula


def test_duplicate_and_recheck_formulas():
    assert 'FIND(",95,",' in p3_duplicate_output_formula("95", "Instagram", "Reel")
    recheck = p3_legacy_recheck_formula("recRECHECK")
    assert 'RECORD_ID()="recRECHECK"' in recheck
    assert '{Script_Status}="Generated"' in recheck
    assert "NOT({Do_Not_Produce})" in recheck


def test_native_photo_stays_ready_for_review():
    assert studio_output_status("Multi-Photo") == "Ready for Review"
    assert studio_output_status("Carousel") == "Ready for Review"
    assert studio_output_status("Multi-Image Post") == "Ready for Review"
    assert studio_asset_selection_status("Carousel") == ""
    assert studio_output_status("Reel") == "In Production"
    assert studio_asset_selection_status("Reel") == "Selected"


def test_studio_enrichment_copies_parent_package():
    parent = {
        "fields": {
            "Content_ID": 95,
            "Content_Title": "Rainy Chicago",
            "Caption": "Parent caption",
            "Hashtags": "#chicago",
            "Thumbnail_URL": "https://example.com/thumb.png",
            "Voiceover_URL": "https://example.com/vo.mp3",
        }
    }
    output = {
        "fields": {
            "Studio_Output_Type": "Reel",
            "Studio_Effective_Requested_Title": "Requested title",
            "Studio_Effective_Requested_Caption": "",
            "Output_Notes": "seeded",
        }
    }
    fields = build_studio_enrichment_fields(parent, output)
    assert fields["Output_Title"] == "Requested title"
    assert fields["Output_Caption"] == "Parent caption\n\n#chicago"
    assert fields["Output_Hashtags"] == "#chicago"
    assert fields["Thumbnail_URL"] == "https://example.com/thumb.png"
    assert fields["Voiceover_URL"] == "https://example.com/vo.mp3"
    assert fields["Output_Status"] == "In Production"
    assert fields["Asset_Selection_Status"] == "Selected"
    assert "STUDIO_P3_REMOTION_HANDOFF_V4" in fields["Output_Notes"]


def test_studio_enrichment_skips_media_when_mode_is_no():
    parent = {
        "fields": {
            "Content_ID": 95,
            "Content_Title": "Silent",
            "Caption": "Caption",
            "Thumbnail_URL": "https://example.com/thumb.png",
            "Voiceover_URL": "https://example.com/vo.mp3",
        }
    }
    output = {
        "fields": {
            "Studio_Output_Type": "Carousel",
            "Studio_Effective_Thumbnail_Mode": "No",
            "Studio_Effective_Voiceover_Mode": "No",
        }
    }
    fields = build_studio_enrichment_fields(parent, output)
    assert fields["Thumbnail_URL"] == "https://example.com/thumb.png"
    assert fields["Voiceover_URL"] == ""
    assert fields["Output_Status"] == "Ready for Review"


def test_parent_media_ready_respects_per_output_modes():
    parent = {"fields": {"Caption": "Ready", "Thumbnail_URL": "", "Voiceover_URL": ""}}
    assert parent_media_ready(parent, thumbnail_mode="No", voiceover_mode="No") is True
    assert parent_media_ready(parent, thumbnail_mode="Yes", voiceover_mode="No") is False


def test_parent_mark_fields_match_make_field_ids():
    studio = parent_mark_fields()
    assert studio == {
        "Review_Status": "Ready for Review",
        "Render_Status": "Not Ready",
        "Content_Status": "Assets Matched",
    }
    legacy = parent_mark_fields(source_authority_ready=False)
    assert legacy["Content_Status"] == "Needs Assets"


def test_effective_platform_and_format_resolution():
    item = {
        "fields": {
            "Studio_Target_Platform": "Instagram",
            "Content_Type": "Reel",
        }
    }
    assert resolve_effective_platforms(item) == "Instagram"
    assert resolve_effective_formats(item) == "Vertical Short Video"
    source = {"fields": {"Production_Target_Platforms": ["YouTube Shorts"], "Production_Content_Type": "Longform"}}
    child = {"fields": {}}
    assert resolve_effective_platforms(child, source) == "YouTube Shorts"
    assert resolve_effective_formats(child, source) == "Longform Video"


def test_mapping_matches_youtube_shorts_alias():
    mapping = {"fields": {"Active": True, "Platform": "YouTube", "Format": "Vertical Short Video"}}
    assert mapping_matches(mapping, "YouTube Shorts", "Vertical Short Video") is True
    assert mapping_matches(mapping, "TikTok", "Vertical Short Video") is False
    assert csv_has("Instagram,TikTok", "TikTok") is True
