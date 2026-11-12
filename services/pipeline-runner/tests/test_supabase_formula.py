"""Allowlisted Airtable formula → PostgREST filters."""

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from studio_produce.context import outputs_formula
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter


def test_platform_equality_and_unsupported_find():
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, '{Platform}="Instagram"',
    ) == "platform.eq.Instagram"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND("recParent", ARRAYJOIN({Content_Item}))',
    ) is None
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'OR({Platform}="TikTok",{Platform}="Instagram")',
    ) is None
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND("233",ARRAYJOIN({PO_Output_ID}))>0',
    ) is None


def test_produce_output_link_finds():
    content_number = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0',
    )
    assert content_number == "link:content_items.content_number=eq.102"
    parent = "recParent12345678"
    content_rec = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        f'FIND("{parent}", ARRAYJOIN({{Content_Item}}))',
    )
    assert content_rec == f"link:content_items.airtable_record_id=eq.{parent}"
    request_id = "recRequest1234567"
    request_link = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        f'FIND("{request_id}", ARRAYJOIN({{Production_Request_Output}}))',
    )
    assert request_link == (
        'link:error_messages=cs.{"Production_Request_Output":["' + request_id + '"]}'
    )
    path = attach_formula_filter("platform_outputs?select=*&limit=50", content_number)
    assert "content_items.content_number=eq.102" in path
    assert "and=" not in path
    assert formula_to_postgrest_filter(
        CONTENT_ITEMS_TABLE,
        'FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0',
    ) is None
    wrapped = (
        'AND(FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0,'
        'OR({Output_Status}="Planned",{Output_Status}="In Production"))'
    )
    assert formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, wrapped) is None
    parent = "recParent12345678"
    request_id = "recRequest1234567"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, parent, 102),
    ) == "link:content_items.content_number=eq.102"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, parent, None),
    ) == f"link:content_items.airtable_record_id=eq.{parent}"
    assert "Production_Request_Output" in formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, None, None),
    )


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
