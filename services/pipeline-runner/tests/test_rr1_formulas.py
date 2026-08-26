from rr1.formulas import rr1_exact_output_formula, rr1_production_formula


def test_rr1_production_formula_matches_worker_contract():
    formula = rr1_production_formula()
    assert '{Output_Status}="Ready for Review"' in formula
    assert '{Review_Email_Sent_At}=BLANK()' in formula
    assert '{Render_Status}="Rendered"' in formula
    assert '{Studio_Output_Type}="Multi-Photo"' in formula
    assert '{Studio_Output_Type}="Carousel"' in formula
    assert '{Render_Status}="Native Photo Route"' in formula


def test_rr1_exact_output_formula_pins_record():
    formula = rr1_exact_output_formula("recRR1TEST", "WAVE3_RUN")
    assert 'RECORD_ID()="recRR1TEST"' in formula
    assert '{Test_Run_ID}="WAVE3_RUN"' in formula
