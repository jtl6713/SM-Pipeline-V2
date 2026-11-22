"""Incident 2670 R2: supported nested FIND filters must not fail closed by precedence."""
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from r2.formulas import r2_exact_output_formula
from supabase_formula import formula_to_postgrest_filter


def test_exact_r2_selector_translates_all_supported_predicates():
    expr=r2_exact_output_formula("recbL59HXWyw8EJ8p")
    translated=formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, expr)
    assert translated is not None
    assert "airtable_record_id.eq.recbL59HXWyw8EJ8p" in translated
    assert "do_not_publish" in translated
    assert "Asset_Selection_Notes" in translated
    assert "Studio exact source authority" in translated
    assert "selected_assets_text" in translated
    assert "render_status" in translated


def test_nested_find_does_not_disable_unsafe_formula_guard():
    expr='AND({Output_Status}="Ready for Review",FIND("x",ARRAYJOIN({Totally_Unknown_Field}))>0)'
    assert formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE,expr) is None


def test_top_level_unrecognized_find_still_fails_closed():
    expr='FIND("x",ARRAYJOIN({Totally_Unknown_Field}))>0'
    assert formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE,expr) is None
