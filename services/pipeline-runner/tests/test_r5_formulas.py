from r5.constants import COMPLETE_STATUSES
from r5.formulas import r5_exact_output_formula, r5_production_formula


def test_r5_production_formula_blank_test_run():
    assert r5_production_formula() == '{Test_Run_ID}=BLANK()'


def test_r5_exact_output_formula_pins_record():
    formula = r5_exact_output_formula("recR5TEST", "ITEM7")
    assert 'RECORD_ID()="recR5TEST"' in formula
    assert '{Test_Run_ID}="ITEM7"' in formula


def test_complete_statuses_include_renderer_values():
    assert "completed" in COMPLETE_STATUSES
    assert "rendered" in COMPLETE_STATUSES
