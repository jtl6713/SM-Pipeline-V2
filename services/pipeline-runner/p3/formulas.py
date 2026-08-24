"""P3 selectors — aligned with Make 5531703 v4.9.1."""

from __future__ import annotations


def _quote(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def _test_run_clause(test_run_id: str = "") -> str:
    return f'OR({{Test_Run_ID}}=BLANK(),{{Test_Run_ID}}="{_quote(test_run_id)}")'


def p3_studio_parent_formula(content_record_id: str, test_run_id: str = "") -> str:
    quoted_id = _quote(content_record_id)
    return (
        f'AND(RECORD_ID()="{quoted_id}",{_test_run_clause(test_run_id)},'
        f'AND({{Production_Request}}!=BLANK(),NOT({{Studio_Is_Output_Work_Item}}),'
        f'{{Caption}}!=BLANK(),'
        f'OR(AND({{Include_Voiceover}}="Yes",{{Voiceover_URL}}!=BLANK()),{{Include_Voiceover}}="No"),'
        f'OR(AND({{Include_Thumbnail}}="Yes",{{Thumbnail_URL}}!=BLANK()),{{Include_Thumbnail}}="No"),'
        f'OR({{Content_Status}}="Thumbnail Ready",{{Content_Status}}="Ready for Thumbnail",'
        f'{{Content_Status}}="Script Generated")))'
    )


def p3_legacy_item_formula(content_record_id: str, test_run_id: str = "") -> str:
    quoted_id = _quote(content_record_id)
    return (
        f'AND(RECORD_ID()="{quoted_id}",{_test_run_clause(test_run_id)},'
        f'OR({{Production_Request}}=BLANK(),{{Studio_Is_Output_Work_Item}}=TRUE()))'
    )


def p3_seeded_outputs_formula(content_id: str) -> str:
    token = _quote(str(content_id))
    return (
        f'AND(FIND(",{token},", "," & ARRAYJOIN({{Content_Item}}) & ",")>0,'
        f'{{Production_Request_Output}}!=BLANK(),{{Output_Status}}="Planned")'
    )


def p3_mapping_formula(platforms_csv: str, formats_csv: str) -> str:
    platforms = _quote(platforms_csv)
    formats = _quote(formats_csv)
    return (
        "AND({Active},"
        f'OR(FIND("," & {{Platform}} & ",", ",{platforms},")>0,'
        f'AND({{Platform}}="YouTube",FIND(",YouTube Shorts,", ",{platforms},")>0)),'
        f'FIND("," & {{Format}} & ",", ",{formats},")>0)'
    )


def p3_duplicate_output_formula(content_id: str, platform: str, output_format: str) -> str:
    return (
        f'AND(FIND(",{_quote(str(content_id))},", "," & ARRAYJOIN({{Content_Item}}) & ",")>0,'
        f'{{Platform}}="{_quote(platform)}",{{Format}}="{_quote(output_format)}")'
    )


def p3_legacy_recheck_formula(content_record_id: str) -> str:
    quoted_id = _quote(content_record_id)
    return (
        f'AND(RECORD_ID()="{quoted_id}",{{Script_Status}}="Generated",'
        f'OR({{Include_Voiceover}}="No",'
        f'AND(OR({{Include_Voiceover}}="Yes",{{Include_Voiceover}}=BLANK()),'
        f'{{Voiceover_Status}}="Generated",{{Voiceover_URL}}!=BLANK())),'
        f'OR({{Include_Thumbnail}}="No",'
        f'AND(OR({{Include_Thumbnail}}="Yes",{{Include_Thumbnail}}=BLANK()),'
        f'{{Thumbnail_Status}}="Generated",{{Thumbnail_URL}}!=BLANK())),'
        f'NOT({{Do_Not_Produce}}))'
    )
