from r2.formulas import r2_exact_output_formula, r2_production_formula


def test_r2_production_formula_contains_eligibility_markers():
    formula = r2_production_formula()
    assert "Ready for Review" in formula
    assert "Asset_Selection_Status" in formula
    assert "Studio exact source authority" in formula
    assert "NOT({Do_Not_Publish})" in formula


def test_r2_exact_output_formula_pins_record_and_test_run():
    formula = r2_exact_output_formula("recTEST123", "ITEM7_RUN")
    assert 'RECORD_ID()="recTEST123"' in formula
    assert '{Test_Run_ID}="ITEM7_RUN"' in formula
    assert "{Do_Not_Publish}=1" in formula


def test_r2_exact_output_formula_production_test_guard():
    formula = r2_exact_output_formula("recTEST123", "")
    assert "{Test_Run_ID}=BLANK()" in formula
    assert "NOT({Do_Not_Publish})" in formula
