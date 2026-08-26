"""RR1 selector formulas — aligned with worker.js STUDIO_RR1_WORK_FORMULA."""

from __future__ import annotations


def rr1_production_formula() -> str:
    return (
        'AND({Test_Run_ID}=BLANK(),{Output_Status}="Ready for Review",'
        '{Review_Email_Sent_At}=BLANK(),OR({Review_Status}=BLANK(),{Review_Status}=""),'
        'OR(AND({Render_Status}="Rendered",{Final_File_URL}!=""),'
        'AND({Render_Status}="Native Photo Route",OR({Studio_Preview_URL}!="",{Thumbnail_URL}!="",{Selected_Assets_JSON}!="")),'
        'AND({Platform}="TikTok",{Studio_Output_Type}="Multi-Photo",{Composition_ID}="",'
        '{Render_Clip_List_JSON}!=""),'
        'AND({Platform}="Instagram",{Studio_Output_Type}="Carousel",{Composition_ID}="",'
        '{Selected_Assets_JSON}!=""),'
        'AND({Platform}="Facebook",{Studio_Output_Type}="Multi-Image Post",'
        '{Composition_ID}="",{Selected_Assets_JSON}!="")))'
    )


def rr1_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'{{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "{Test_Run_ID}=BLANK(),"
    )
    return (
        f'AND(RECORD_ID()="{quoted_id}",{test_guard}'
        f'{{Output_Status}}="Ready for Review",'
        f'{{Review_Email_Sent_At}}=BLANK(),'
        f'OR({{Review_Status}}=BLANK(),{{Review_Status}}=""))'
    )
