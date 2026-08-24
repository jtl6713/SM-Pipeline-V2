from datetime import timedelta

from r2.updates import _clip_count_default
from r2b.constants import RETRY_DELAY_MINUTES, RETRY_VIEW
from r2b.formulas import r2b_exact_output_formula, r2b_production_formula


def test_r2b_production_formula_matches_make_module_1():
    assert r2b_production_formula() == "{Test_Run_ID}=BLANK()"


def test_r2b_exact_output_formula_pins_record():
    formula = r2b_exact_output_formula("recR2BTEST", "WAVE5")
    assert 'RECORD_ID()="recR2BTEST"' in formula
    assert '{Test_Run_ID}="WAVE5"' in formula


def test_r2b_retry_view_and_delay_match_make():
    assert RETRY_VIEW == "R2B - Retry Asset Selection"
    assert RETRY_DELAY_MINUTES == 15
    assert timedelta(minutes=RETRY_DELAY_MINUTES).total_seconds() == 900


def test_clip_count_defaults_match_r2():
    exact = {"fields": {"Requested_Video_Clip_Count_Mode": "Exact", "Requested_Video_Clip_Count_Exact": 5}}
    assert _clip_count_default(exact) == 5
    longform = {"fields": {"Requested_Video_Clip_Count_Mode": "AI decides", "Target_Final_Length": 45}}
    assert _clip_count_default(longform) == 7
