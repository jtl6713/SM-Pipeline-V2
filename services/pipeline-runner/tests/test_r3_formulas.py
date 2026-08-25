from r3.formulas import r3_exact_output_formula, r3_production_formula
from r3.processor import _eligible_exact_output
from r3.render_prep import build_update_fields


def test_r3_production_formula_matches_worker_contract():
    formula = r3_production_formula()
    assert '{Asset_Selection_Status}="Selected"' in formula
    assert '{Render_Status}=BLANK()' in formula
    assert '{Studio_Output_Type}!="Story"' in formula
    assert "Slideshow Video" in formula


def test_r3_exact_output_formula_pins_record():
    formula = r3_exact_output_formula("recR3TEST", "WAVE2_RUN")
    assert 'RECORD_ID()="recR3TEST"' in formula
    assert '{Test_Run_ID}="WAVE2_RUN"' in formula
    assert "Selected_Assets_JSON" not in formula


def test_r3_exact_eligibility_accepts_selected_blank_status():
    output = {
        "fields": {
            "Asset_Selection_Status": "Selected",
            "Selected_Assets_JSON": '{"selection_status":"Selected"}',
            "Render_Status": "",
        }
    }
    assert _eligible_exact_output(output) is True
    output["fields"]["Render_Status"] = "Ready for Render"
    assert _eligible_exact_output(output) is False


def test_r3_copies_parent_voiceover_url():
    output = {"fields": {"Composition_ID": "ChicagoShiningPhotoSequence"}}
    package = {
        "selection_status": "Selected",
        "render_prep": {
            "render_status": "Ready for Render",
            "title_text": "Title",
            "brand_text": "Brand",
            "output_filename": "out.mp4",
            "render_total_frames": 150,
            "compatibility_clip_1_url": "https://example.com/a.jpg",
            "compatibility_clip_1_duration_frames": 150,
        },
    }
    parent = {"fields": {"Voiceover_URL": "https://example.com/vo.mp3"}}
    fields = build_update_fields(output, package, parent)
    assert fields["Voiceover_URL"] == "https://example.com/vo.mp3"
