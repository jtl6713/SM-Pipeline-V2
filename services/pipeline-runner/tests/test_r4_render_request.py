from r4.constants import R4_CLEAR_FIELDS
from r4.formulas import r4_exact_output_formula, r4_production_formula
from r4.processor import _eligible_exact_output
from r4.render_request import choose_render_request, voiceover_is_required


def test_r4_production_formula_requires_render_package():
    formula = r4_production_formula()
    assert '{Render_Status}="Ready for Render"' in formula
    assert "{Render_Total_Frames}>0" in formula
    assert '{Studio_Output_Type}!="Story"' in formula


def test_r4_exact_output_formula_pins_record():
    formula = r4_exact_output_formula("recR4TEST", "")
    assert 'RECORD_ID()="recR4TEST"' in formula
    assert "{Test_Run_ID}=BLANK()" in formula
    assert "Render_Clip_List_JSON" not in formula


def test_r4_clear_fields_null_select_instead_of_empty_string():
    assert R4_CLEAR_FIELDS["Final_File_Storage_Status"] is None


def test_r4_exact_eligibility_requires_ready_package():
    output = {
        "fields": {
            "Render_Status": "Ready for Render",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Output_Filename": "out.mp4",
            "Render_Clip_List_JSON": "[{}]",
            "Render_Total_Frames": 450,
        }
    }
    assert _eligible_exact_output(output) is True
    output["fields"]["Render_Status"] = "Rendering"
    assert _eligible_exact_output(output) is False


def test_r4_no_voiceover_request_dimensions():
    output = {
        "fields": {
            "Output_Filename": "test.mp4",
            "Composition_ID": "ChicagoShiningVertical",
            "Title_Text": "Title",
            "Brand_Text": "Brand",
            "Aspect_Ratio": "9:16",
            "Render_Total_Frames": 90,
            "Selected_Clip_Count": 2,
            "Render_Clip_List_JSON": "[]",
            "Music_URL": "",
        }
    }
    route, payload = choose_render_request(output, None, default_music=0.35, default_voice=1.0)
    assert route == "no_voiceover"
    assert payload["width"] == 1080
    assert payload["height"] == 1920
    assert payload["durationInFrames"] == 90


def _photo_output(**fields):
    base = {
        "Output_Filename": "test.mp4",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Title_Text": "Title",
        "Brand_Text": "Brand",
        "Aspect_Ratio": "9:16",
        "Render_Total_Frames": 900,
        "Selected_Clip_Count": 1,
        "Render_Clip_List_JSON": "[]",
        "Music_URL": "",
    }
    base.update(fields)
    return {"fields": base}


def test_r4_uses_parent_voiceover_when_output_blank():
    output = _photo_output()
    parent = {"fields": {"Voiceover_URL": "https://example.com/vo.mp3", "Voiceover_Script": "hello"}}
    route, payload = choose_render_request(output, parent, default_music=0.35, default_voice=1.0)
    assert route == "voiceover"
    assert payload["voiceover"]["url"] == "https://example.com/vo.mp3"
    assert payload["voiceoverUrl"] == "https://example.com/vo.mp3"
    assert payload["durationIsExplicit"] is False


def test_r4_voiceover_without_content_item_does_not_crash():
    output = _photo_output(Voiceover_URL="https://example.com/output-vo.mp3")
    route, payload = choose_render_request(output, None, default_music=0.35, default_voice=1.0)
    assert route == "voiceover"
    assert payload["voiceover"]["url"] == "https://example.com/output-vo.mp3"


def test_r4_voiceover_required_when_effective_mode_is_yes():
    output = _photo_output(Studio_Effective_Voiceover_Mode="Yes")
    assert voiceover_is_required(output, None) is True
    parent = {"fields": {"Include_Voiceover": "Yes"}}
    assert voiceover_is_required(_photo_output(), parent) is True
    assert voiceover_is_required(_photo_output(Studio_Effective_Voiceover_Mode="No"), parent) is False


def test_r4_p020_merges_parent_voiceover():
    output = _photo_output(Creative_Render_Manifest_JSON="{}")
    parent = {"fields": {"Voiceover_URL": "https://example.com/parent-vo.mp3"}}
    route, payload = choose_render_request(output, parent, default_music=0.35, default_voice=1.0)
    assert route == "p020_manifest"
    assert payload["voiceover"]["url"] == "https://example.com/parent-vo.mp3"
    assert payload["voiceoverUrl"] == "https://example.com/parent-vo.mp3"
