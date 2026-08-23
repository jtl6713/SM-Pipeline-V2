from r3.formulas import r3_exact_output_formula, r3_production_formula


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
