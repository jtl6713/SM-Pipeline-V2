from __future__ import annotations


def lettering_production_formula() -> str:
    return (
        'AND({Test_Run_ID}=BLANK(),{Render_Status}="Native Photo Route",'
        'OR({Output_Status}="Ready for Review",{Output_Status}="In Production"),'
        'OR({Render_Clip_List_JSON}!="",{Selected_Assets_JSON}!=""))'
    )


def lettering_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'AND({{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "AND({Test_Run_ID}=BLANK(),"
    )
    return (
        f'AND(RECORD_ID()="{quoted_id}",{test_guard}'
        f'{{Render_Status}}="Native Photo Route"))'
    )
