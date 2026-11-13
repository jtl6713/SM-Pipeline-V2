"""Allowlisted Airtable formula → PostgREST filters."""

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from lettering.formulas import lettering_production_formula
from p3.formulas import p3_duplicate_output_formula, p3_mapping_formula, p3_seeded_outputs_formula
from r3.formulas import r3_production_formula
from studio_produce.context import outputs_formula
from supabase_formula import attach_formula_filter, formula_to_postgrest_filter
from t1.formulas import t1_production_formula


def test_text_find_and_spaced_link_find():
    notes = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND("Studio exact source authority", {Asset_Selection_Notes} & "") > 0',
    )
    assert notes == "error_messages->>Asset_Selection_Notes.like.*Studio exact source authority*"
    missing = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND("https://render.example",{Remotion_Status_URL})=0',
    )
    assert missing is not None
    assert "not.like.*https://render.example*" in missing
    assets = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        "FIND('drive-id', {Selected_Assets_JSON} & '') > 0",
    )
    assert assets == "selected_assets_text.like.*drive-id*"
    spaced = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",") > 0',
    )
    assert spaced == "content_number.eq.102"


def test_snapshotted_runner_views():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from supabase_views import view_to_postgrest_filter

    now = datetime(2026, 11, 12, 15, 0, tzinfo=ZoneInfo("America/Chicago"))
    rendering = view_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, "R5 - Rendering Jobs to Poll", now=now,
    )
    assert rendering is not None
    assert "render_status.eq.Rendering" in rendering
    assert "final_file_url" in rendering
    retry = view_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, "R2B - Retry Asset Selection", now=now,
    )
    assert retry is not None
    assert "content_item_id.not.is.null" in retry
    assert "Asset_Selection_Attempt_Count.lt.5" in retry
    assert "lt.2026-11-13T06:00:00Z" in retry
    assert "render_clip_list" in retry
    assert view_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, "Ready Queue") is None
    legacy = view_to_postgrest_filter(CONTENT_ITEMS_TABLE, "viwwnVJVPqfy7iYJK")
    assert legacy is not None
    assert "platform_output_count" in legacy
    package = view_to_postgrest_filter(
        CONTENT_ITEMS_TABLE, "P1 - Ready for Package Generation",
    )
    assert package is not None
    assert "Source_Candidate" in package
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
    assert content_number == "content_number.eq.102"
    parent = "recParent12345678"
    content_rec = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        f'FIND("{parent}", ARRAYJOIN({{Content_Item}}))',
    )
    assert content_rec == f"content_item_airtable_id.eq.{parent}"
    request_id = "recRequest1234567"
    request_link = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        f'FIND("{request_id}", ARRAYJOIN({{Production_Request_Output}}))',
    )
    assert request_link == f"production_request_output_text.like.*{request_id}*"
    path = attach_formula_filter("platform_outputs?select=*&limit=50", content_number)
    assert "content_number.eq.102" in path
    assert "and=" in path
    assert formula_to_postgrest_filter(
        CONTENT_ITEMS_TABLE,
        'FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0',
    ) is None
    wrapped = (
        'AND(FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0,'
        'OR({Output_Status}="Planned",{Output_Status}="In Production"))'
    )
    wrapped_filter = formula_to_postgrest_filter(PLATFORM_OUTPUTS_TABLE, wrapped)
    assert wrapped_filter is not None
    assert "content_number.eq.102" in wrapped_filter
    assert "or(output_status.eq.Planned,output_status.eq.In Production)" in wrapped_filter
    wrapped_path = attach_formula_filter("platform_outputs?select=*&limit=50", wrapped_filter)
    assert "content_number.eq.102" in wrapped_path
    assert "output_status.eq.Planned" in wrapped_path
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        'OR(FIND(",102,", "," & ARRAYJOIN({Content_Item}) & ",")>0,{Platform}="TikTok")',
    ) == "or(content_number.eq.102,platform.eq.TikTok)"
    parent = "recParent12345678"
    request_id = "recRequest1234567"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, parent, 102),
    ) == "content_number.eq.102"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, parent, None),
    ) == f"content_item_airtable_id.eq.{parent}"
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, outputs_formula(request_id, None, None),
    ) == f"production_request_output_text.like.*{request_id}*"


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
    assert "content_number.eq.102" in seeded
    assert "production_request_output_text" in seeded
    assert "or(output_status.eq.Planned,output_status.eq.In Production)" in seeded
    duplicate = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE,
        p3_duplicate_output_formula("102", "Instagram", "Reel"),
    )
    assert duplicate == "and(content_number.eq.102,platform.eq.Instagram,format.eq.Reel)"
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


def test_due_now_formulas_use_stored_columns():
    due = formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, "{YouTube_Action_Due_Now}=1",
    )
    assert due is not None
    assert "platform.eq.YouTube" in due
    assert "DATETIME_" not in due
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, "{TTD0_Asset_Route_Ready}=1",
    ) is None
    assert formula_to_postgrest_filter(
        PLATFORM_OUTPUTS_TABLE, "{Assets_Need_Resolution}=1",
    ) is None


def test_content_not_checkbox_uses_extras_bag():
    got = formula_to_postgrest_filter(
        CONTENT_ITEMS_TABLE,
        'AND(RECORD_ID()="recContentABCDEF1",NOT({Do_Not_Produce}))',
    )
    assert "airtable_record_id.eq.recContentABCDEF1" in got
    assert "extras->>Do_Not_Produce" in got
