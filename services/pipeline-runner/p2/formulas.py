"""P2 content-item selector and recheck formulas — aligned with Make 5530955."""

from __future__ import annotations


def p2_exact_content_formula(content_record_id: str, test_run_id: str = "") -> str:
    quoted_id = content_record_id.replace("'", "\\'")
    if test_run_id:
        test_guard = f'{{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
    else:
        test_guard = "{Test_Run_ID}=BLANK(),"
    return f'AND(RECORD_ID()="{quoted_id}",{test_guard}NOT({{Do_Not_Produce}}))'


def recheck_voiceover_and_thumbnail(content_record_id: str) -> str:
    quoted_id = content_record_id.replace("'", "\\'")
    return (
        f'AND(\n'
        f'  RECORD_ID() = "{quoted_id}",\n'
        f'  {{Content_Status}} = "Ready for Voiceover",\n'
        f'  {{Script_Status}} = "Generated",\n'
        f'  {{Voiceover_Status}} = "Ready",\n'
        f'  {{Thumbnail_Status}} = "Ready",\n'
        f'  {{Voiceover_Script}} != BLANK(),\n'
        f'  {{Thumbnail_Prompt}} != BLANK(),\n'
        f'  NOT({{Do_Not_Produce}}),\n'
        f'  {{Voiceover_URL}} = BLANK(),\n'
        f'  {{Voiceover_Google_Drive_File_ID}} = BLANK(),\n'
        f'  OR({{Voiceover_Normalization_Status}} = BLANK(), {{Voiceover_Normalization_Status}} != "Normalized"),\n'
        f'  {{Thumbnail_URL}} = BLANK(),\n'
        f'  {{Thumbnail_Google_Drive_File_ID}} = BLANK()\n'
        f')'
    )


def recheck_voiceover_only(content_record_id: str) -> str:
    quoted_id = content_record_id.replace("'", "\\'")
    return (
        f'AND(\n'
        f'  RECORD_ID() = "{quoted_id}",\n'
        f'  {{Content_Status}} = "Ready for Voiceover",\n'
        f'  {{Script_Status}} = "Generated",\n'
        f'  {{Voiceover_Status}} = "Ready",\n'
        f'  {{Thumbnail_Status}} = "Not Needed",\n'
        f'  {{Voiceover_Script}} != BLANK(),\n'
        f'  NOT({{Do_Not_Produce}}),\n'
        f'  {{Voiceover_URL}} = BLANK(),\n'
        f'  {{Voiceover_Google_Drive_File_ID}} = BLANK(),\n'
        f'  OR({{Voiceover_Normalization_Status}} = BLANK(), {{Voiceover_Normalization_Status}} != "Normalized")\n'
        f')'
    )


def recheck_silent_thumbnail(content_record_id: str) -> str:
    quoted_id = content_record_id.replace("'", "\\'")
    return (
        f'AND(\n'
        f'  RECORD_ID() = "{quoted_id}",\n'
        f'  {{Thumbnail_Status}} = "Ready",\n'
        f'  {{Thumbnail_Prompt}} != BLANK(),\n'
        f'  {{Thumbnail_URL}} = BLANK(),\n'
        f'  {{Thumbnail_Google_Drive_File_ID}} = BLANK(),\n'
        f'  OR({{Include_Voiceover}} = "No", {{Voiceover_Status}} = "Not Needed"),\n'
        f'  NOT({{Do_Not_Produce}})\n'
        f')'
    )
