from r5.constants import COMPLETE_STATUSES
from r5.formulas import r5_exact_output_formula, r5_production_formula
from r5.processor import review_fields_after_successful_render


def test_r5_production_formula_blank_test_run():
    assert r5_production_formula() == '{Test_Run_ID}=BLANK()'


def test_r5_exact_output_formula_pins_record():
    formula = r5_exact_output_formula("recR5TEST", "ITEM7")
    assert 'RECORD_ID()="recR5TEST"' in formula
    assert '{Test_Run_ID}="ITEM7"' in formula


def test_complete_statuses_include_renderer_values():
    assert "completed" in COMPLETE_STATUSES
    assert "rendered" in COMPLETE_STATUSES


def test_successful_render_restores_changes_requested_to_review_sent():
    output = {"id": "rec255", "fields": {"Review_Status": "Changes Requested"}}
    assert review_fields_after_successful_render(output) == {"Review_Status": "Review Sent"}


def test_successful_render_leaves_other_review_statuses_alone():
    assert review_fields_after_successful_render({"fields": {"Review_Status": "Review Sent"}}) == {}
    assert review_fields_after_successful_render({"fields": {"Review_Status": "Approved"}}) == {}
    assert review_fields_after_successful_render({"fields": {}}) == {}
