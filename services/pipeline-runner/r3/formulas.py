"""R3 selector formulas — aligned with worker.js STUDIO_R3_WORK_FORMULA."""

from __future__ import annotations


def r3_production_formula() -> str:
    return (
        'AND({Test_Run_ID}=BLANK(),AND({Asset_Selection_Status}="Selected",'
        '{Selected_Assets_JSON}!="",{Render_Status}=BLANK(),{Format}!="Story",'
        '{Studio_Output_Type}!="Story",OR({Format}="Vertical Short Video",'
        '{Format}="Longform Video",{Format}="Feed Post",{Format}="Reel",'
        '{Format}="Slideshow Reel",{Format}="Video Draft",{Format}="Short",'
        '{Format}="Standard Video",{Format}="Slideshow Video")))'
    )


def r3_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    test_guard = (
        f'AND({{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}",'
        if test_run_id
        else "AND({Test_Run_ID}=BLANK(),"
    )
    return (
        f'AND(RECORD_ID()="{quoted_id}",{test_guard}'
        f'{{Asset_Selection_Status}}="Selected",{{Render_Status}}=BLANK())'
    )
