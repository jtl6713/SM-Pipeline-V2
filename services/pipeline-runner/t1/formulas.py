from __future__ import annotations


def t1_production_formula() -> str:
    return (
        'AND({Test_Run_ID}=BLANK(),{Render_Status}="Ready for Render",'
        '{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",'
        '{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story",'
        'OR({Timing_Status}=BLANK(),{Timing_Status}="Pending"),'
        'OR({Music_URL}!="",{Selected_Music_URL}!=""))'
    )


def t1_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'AND({{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "AND({Test_Run_ID}=BLANK(),"
    )
    return (
        f'AND(RECORD_ID()="{quoted_id}",{test_guard}'
        f'{{Render_Status}}="Ready for Render")'
    )
