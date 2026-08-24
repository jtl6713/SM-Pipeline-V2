"""R4 selector formulas — aligned with worker.js STUDIO_R4_WORK_FORMULA."""

from __future__ import annotations


def r4_production_formula() -> str:
    return (
        'AND({Test_Run_ID}=BLANK(),AND({Render_Status}="Ready for Render",'
        '{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",'
        '{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story"))'
    )


def r4_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'AND({{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "AND({Test_Run_ID}=BLANK(),"
    )
    return (
        f'AND(RECORD_ID()="{quoted_id}",{test_guard}'
        f'{{Render_Status}}="Ready for Render",{{Composition_ID}}!="",'
        f'{{Output_Filename}}!="",{{Render_Clip_List_JSON}}!="",{{Render_Total_Frames}}>0)'
    )
