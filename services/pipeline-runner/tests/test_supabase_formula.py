"""Allowlisted Airtable formula → PostgREST filters."""

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter


def test_platform_equality_and_unsupported_find():
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, '{Platform}="Instagram"',
    ) == "platform.eq.Instagram"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND("recParent", ARRAYJOIN({Content_Item}))',
    ) is None


def test_nested_and_blank_and_record_id():
    formula = (
        'AND(RECORD_ID()="recABCDEFGHIJKLMN",'
        'AND({Test_Run_ID}=BLANK(),{Render_Status}="Ready for Render"))'
    )
    got = formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, formula)
    assert "airtable_record_id.eq.recABCDEFGHIJKLMN" in got
    assert "or(test_run_id.is.null,test_run_id.eq.)" in got
    assert "render_status.eq.Ready for Render" in got
    path = attach_formula_filter("platform_outputs?select=*&limit=1", got)
    assert "Ready%20for%20Render" in path
    assert "%2520" not in path


def test_content_not_checkbox_uses_extras_bag():
    got = formula_to_postgrest_filter(
        CONTENT_ITEMS_TABLE,
        'AND(RECORD_ID()="recContentABCDEF1",NOT({Do_Not_Produce}))',
    )
    assert "airtable_record_id.eq.recContentABCDEF1" in got
    assert "extras->>Do_Not_Produce" in got
