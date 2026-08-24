"""Airtable selector formulas for R2 — aligned with Make module 1 and worker.js."""

from __future__ import annotations


def r2_production_formula() -> str:
    """Make module 1 eligibility (STUDIO_OR_LEGACY_R2_ELIGIBILITY_V1)."""
    return """AND(
  NOT({Do_Not_Publish}),
  {Content_Item} != BLANK(),
  {Output_Status} = "Ready for Review",
  OR({Asset_Need_Status} = "Not Needed", {Asset_Need_Status} = "Fulfilled"),
  {Asset_Selection_Status} = BLANK(),
  {Render_Status} = BLANK(),
  {Remotion_Job_ID} = BLANK(),
  {Remotion_Props_JSON} = BLANK(),
  {Final_File_URL} = BLANK(),
  {Final_File_ID} = BLANK(),
  {Output_URL} = BLANK(),
  {Published_At} = BLANK(),
  {Platform_Post_URL} = BLANK(),
  OR(
    AND(
      {Selected_Assets_JSON} = BLANK(),
      {Selected_Clip_Count} = BLANK(),
      {Render_Clip_List_JSON} = BLANK()
    ),
    AND(
      FIND("Studio exact source authority", {Asset_Selection_Notes} & "") > 0,
      {Selected_Assets_JSON} != BLANK(),
      {Selected_Clip_Count} > 0,
      {Render_Clip_List_JSON} != BLANK()
    )
  )
)"""


def r2_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    """Pin one Platform Output for Item 7 / test-mode exact pulses."""
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'AND({{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "AND({Test_Run_ID}=BLANK(),"
    )
    publish_guard = (
        "{Do_Not_Publish}=1,"
        if test_run_id
        else "NOT({Do_Not_Publish}),"
    )
    return f"""AND(
  RECORD_ID()="{quoted_id}",
  {test_guard}
  {publish_guard}
  {{Content_Item}} != BLANK(),
  {{Output_Status}} = "Ready for Review",
  OR({{Asset_Need_Status}} = "Not Needed", {{Asset_Need_Status}} = "Fulfilled"),
  {{Asset_Selection_Status}} = BLANK(),
  {{Render_Status}} = BLANK(),
  {{Remotion_Job_ID}} = BLANK(),
  {{Remotion_Props_JSON}} = BLANK(),
  {{Final_File_URL}} = BLANK(),
  {{Final_File_ID}} = BLANK(),
  {{Output_URL}} = BLANK(),
  {{Published_At}} = BLANK(),
  {{Platform_Post_URL}} = BLANK(),
  OR(
    AND(
      {{Selected_Assets_JSON}} = BLANK(),
      {{Selected_Clip_Count}} = BLANK(),
      {{Render_Clip_List_JSON}} = BLANK()
    ),
    AND(
      FIND("Studio exact source authority", {{Asset_Selection_Notes}} & "") > 0,
      {{Selected_Assets_JSON}} != BLANK(),
      {{Selected_Clip_Count}} > 0,
      {{Render_Clip_List_JSON}} != BLANK()
    )
  )
))"""
