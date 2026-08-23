from r4.formulas import r4_exact_output_formula, r4_production_formula
from r4.render_request import build_no_voiceover_request, choose_render_request


def test_r4_production_formula_requires_render_package():
    formula = r4_production_formula()
    assert '{Render_Status}="Ready for Render"' in formula
    assert "{Render_Total_Frames}>0" in formula
    assert '{Studio_Output_Type}!="Story"' in formula


def test_r4_exact_output_formula_pins_record():
    formula = r4_exact_output_formula("recR4TEST", "")
    assert 'RECORD_ID()="recR4TEST"' in formula
    assert "{Test_Run_ID}=BLANK()" in formula


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
