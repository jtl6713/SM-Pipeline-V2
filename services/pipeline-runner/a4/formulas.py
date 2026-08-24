"""A4 Airtable formulas and Platform Output R2B-reset field maps (Make 5578180)."""

from __future__ import annotations

from typing import Any


def escape_formula_value(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


def unpublished_outputs_using_asset_formula(media_asset_id: str, drive_file_id: str) -> str:
    asset = escape_formula_value(media_asset_id)
    drive = escape_formula_value(drive_file_id)
    return f"""AND(
  {{Test_Run_ID}}=BLANK(),
  AND(
    NOT({{Do_Not_Publish}}),
    {{Published_At}}=BLANK(),
    OR(
      {{Selected_Clip_1_Media_Asset_ID}}='{asset}',
      {{Selected_Clip_2_Media_Asset_ID}}='{asset}',
      {{Selected_Clip_3_Media_Asset_ID}}='{asset}',
      {{Selected_Music_Media_Asset_ID}}='{asset}',
      FIND('{asset}', {{Selected_Clip_1_URL}} & '') > 0,
      FIND('{drive}', {{Selected_Clip_1_URL}} & '') > 0,
      FIND('{asset}', {{Selected_Clip_2_URL}} & '') > 0,
      FIND('{drive}', {{Selected_Clip_2_URL}} & '') > 0,
      FIND('{asset}', {{Selected_Clip_3_URL}} & '') > 0,
      FIND('{drive}', {{Selected_Clip_3_URL}} & '') > 0,
      FIND('{asset}', {{Selected_Music_URL}} & '') > 0,
      FIND('{drive}', {{Selected_Music_URL}} & '') > 0,
      FIND('{asset}', {{Clip_1_URL}} & '') > 0,
      FIND('{drive}', {{Clip_1_URL}} & '') > 0,
      FIND('{asset}', {{Clip_2_URL}} & '') > 0,
      FIND('{drive}', {{Clip_2_URL}} & '') > 0,
      FIND('{asset}', {{Clip_3_URL}} & '') > 0,
      FIND('{drive}', {{Clip_3_URL}} & '') > 0,
      FIND('{asset}', {{Music_URL}} & '') > 0,
      FIND('{drive}', {{Music_URL}} & '') > 0,
      FIND('{asset}', {{Selected_Assets_JSON}} & '') > 0,
      FIND('{drive}', {{Selected_Assets_JSON}} & '') > 0,
      FIND('{asset}', {{Render_Clip_List_JSON}} & '') > 0,
      FIND('{drive}', {{Render_Clip_List_JSON}} & '') > 0,
      FIND('{asset}', {{Remotion_Props_JSON}} & '') > 0,
      FIND('{drive}', {{Remotion_Props_JSON}} & '') > 0
    )
  )
)"""


OUTPUT_R2B_RESET_VALUES: dict[str, Any] = {
    "Output_Status": "Ready for Review",
    "Publish_Status": "Not Ready",
    "Asset_Selection_Status": "Partial Match",
    "Asset_Selection_Last_Result": "Partial Match",
    "Asset_Need_Status": "Partially Fulfilled",
    "Asset_Selection_Retry_Eligible": True,
    "Asset_Selection_Notes": (
        "A4 cleared selected assets because one raw asset is no longer available in Google Drive. "
        "Output is now eligible for R2B retry asset selection immediately."
    ),
    "Asset_Selection_Failure_Reason": (
        "A4 detected that a selected/raw Media Asset was moved to Google Drive Trash, removed, or "
        "became inaccessible. Cleared selected asset/render/review/publish fields, cleared retry "
        "delay fields, and moved this unpublished output back to R2B retry asset selection."
    ),
}

OUTPUT_R2B_NULL_FIELDS = (
    "Review_Decision_Token",
    "Asset_Selection_Minimum_Assets_Needed",
    "Selected_Clip_2_Media_Asset_ID",
    "Final_File_Error_Message",
    "Render_Clip_List_JSON",
    "Selected_Music_Media_Asset_ID",
    "Music_URL",
    "Selected_Clip_2_URL",
    "Selected_Clip_1_URL",
    "Selected_Clip_1_Media_Asset_ID",
    "Selected_Assets_JSON",
    "Clip_2_URL",
    "Remotion_Error_Message",
    "Review_Status",
    "Asset_Selection_Attempt_Count",
    "Final_File_ID",
    "Selected_Asset_Summary",
    "Final_File_Name",
    "Selected_Clip_3_URL",
    "Clip_3_URL",
    "Remotion_Props_JSON",
    "Final_File_Storage_Status",
    "Selected_Clip_3_Media_Asset_ID",
    "Render_Server_URL",
    "Output_URL",
    "Last_Asset_Selection_Attempt_At",
    "Clip_1_URL",
    "Remotion_Job_ID",
    "Asset_Selection_Next_Retry_At",
    "Final_File_URL",
    "Remotion_Status_URL",
    "Asset_Selection_Assets_Found_Count",
    "Render_Status",
    "Publish_Error_Message",
    "Selected_Music_URL",
)


def output_r2b_reset_fields() -> dict[str, Any]:
    fields = dict(OUTPUT_R2B_RESET_VALUES)
    for name in OUTPUT_R2B_NULL_FIELDS:
        fields[name] = None
    return fields


def linked_record_mentions(value: Any, *needles: str) -> bool:
    if isinstance(value, list):
        haystack = ",".join(str(item) for item in value)
    else:
        haystack = str(value or "")
    return any(needle and needle in haystack for needle in needles)
