"""Allowlisted Airtable formula → PostgREST filters."""

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from lettering.formulas import lettering_production_formula
from p3.formulas import p3_duplicate_output_formula, p3_mapping_formula, p3_seeded_outputs_formula
from r3.formulas import r3_production_formula
from studio_produce.context import outputs_formula
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter
from t1.formulas import t1_production_formula


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
    ) == "or(platform.eq.TikTok,platform.eq.Instagram)"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'OR({Platform}="TikTok",FIND("233",ARRAYJOIN({PO_Output_ID}))>0)',
    ) is None
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, '{Format}!="Story"',
    ) == "format.neq.Story"
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
    wrapped_filter = formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, wrapped)
    assert wrapped_filter == (
        "combo:content_items.content_number=eq.102|||"
        "or(output_status.eq.Planned,output_status.eq.In Production)"
    )
    wrapped_path = attach_formula_filter("platform_outputs?select=*&limit=50", wrapped_filter)
    assert "content_items.content_number=eq.102" in wrapped_path
    assert "output_status.eq.Planned" in wrapped_path
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'OR(FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0,{Platform}="TikTok")',
    ) is None
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


def test_or_of_allowlisted_predicates():
    lettering = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, lettering_production_formula(),
    )
    assert lettering is not None
    assert "or(output_status.eq.Ready for Review,output_status.eq.In Production)" in lettering
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, t1_production_formula(),
    ) is not None
    r3 = formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, r3_production_formula())
    assert r3 is not None
    assert "format.neq.Story" in r3
    assert "or(format.eq.Vertical Short Video," in r3
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'OR({Output_Title}="Hello, world",{Platform}="TikTok")',
    ) is None
    assert formula_to_postgrest_filter(
        CONTENT_ITEMS_TABLE,
        'OR({Content_Status}="Idea Approved",{Content_Status}="Ready for Script")',
    ) == "or(content_status.eq.Idea Approved,content_status.eq.Ready for Script)"


def test_p3_output_formulas_compose_the_content_link():
    seeded = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, p3_seeded_outputs_formula("102"),
    )
    assert seeded is not None
    assert seeded.startswith("combo:content_items.content_number=eq.102|||")
    assert "Production_Request_Output" in seeded
    assert "or(output_status.eq.Planned,output_status.eq.In Production)" in seeded
    duplicate = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        p3_duplicate_output_formula("102", "Instagram", "Reel"),
    )
    assert duplicate == (
        "combo:content_items.content_number=eq.102|||"
        "and(platform.eq.Instagram,format.eq.Reel)"
    )
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, p3_mapping_formula("Instagram,TikTok", "Reel"),
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
