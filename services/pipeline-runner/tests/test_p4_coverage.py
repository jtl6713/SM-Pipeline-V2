from p4.constants import MAKE_SCENARIO_ID, P5_CHICAGO_HOUR_BEFORE
from p4.coverage import (
    deterministic_existing_count,
    deterministic_missing_count,
    effective_video_target,
    validate_coverage,
    video_target_valid,
)
from p4.formulas import p4_exact_record_formula, p4_output_id_formula
from p5.constants import MAKE_SCENARIO_ID as P5_ID
from p5.constants import OPEN_SHOTS_VIEW
from p5.email_builder import reminder_subject
from p5.formulas import p5_production_formula


def test_p4_output_id_formula_uses_test_identity():
    assert p4_output_id_formula(227) == "AND({Output_ID}=227,{Test_Run_ID}=BLANK())"
    assert '{Test_Run_ID}="WAVE5"' in p4_output_id_formula(227, "WAVE5")
    assert 'RECORD_ID()="recP4TEST"' in p4_exact_record_formula("recP4TEST")


def test_video_target_exact_and_range():
    exact = {"fields": {"Requested_Video_Clip_Count_Mode": "Exact", "Requested_Video_Clip_Count_Exact": 5}}
    assert video_target_valid(exact)
    assert effective_video_target(exact, {}, {}) == 5
    bad = {"fields": {"Requested_Video_Clip_Count_Mode": "Exact", "Requested_Video_Clip_Count_Exact": 0}}
    assert not video_target_valid(bad)
    ranged = {
        "fields": {
            "Requested_Video_Clip_Count_Mode": "Target range",
            "Requested_Video_Clip_Count_Min": 3,
            "Requested_Video_Clip_Count_Max": 7,
        }
    }
    assert effective_video_target(ranged, {}, {}) == 3


def test_deterministic_counts_cap_at_target():
    assert deterministic_existing_count(20, 7) == 7
    assert deterministic_existing_count(2, 7) == 2
    assert deterministic_missing_count(7, 2) == 5
    assert deterministic_missing_count(7, 7) == 0


def test_validate_coverage_pass_for_exact_video():
    output = {"fields": {"Requested_Video_Clip_Count_Mode": "Exact", "Requested_Video_Clip_Count_Exact": 2}}
    content = {"fields": {"Content_Type": "Video", "Content_Duration": 30}}
    parsed = {
        "asset_request_needed": True,
        "existing_covered_visual_count": 0,
        "existing_matching_asset_ids": [],
        "existing_covered_final_length_seconds": 0,
        "missing_asset_count": 2,
        "shot_list": [
            {"desired_final_length_seconds": 15, "recommended_raw_capture_seconds": 40},
            {"desired_final_length_seconds": 15, "recommended_raw_capture_seconds": 40},
        ],
    }
    assert validate_coverage(parsed, output=output, content_item=content, production_profile={}) == "PASS"


def test_p5_formula_and_view_match_make():
    assert p5_production_formula() == "{Test_Run_ID}=BLANK()"
    assert OPEN_SHOTS_VIEW == "P4/P5 - Open Asset Needs Dashboard"
    assert MAKE_SCENARIO_ID == 5533802
    assert P5_ID == 5536624
    assert P5_CHICAGO_HOUR_BEFORE == 15
    assert "open shot(s)" in reminder_subject(3)
