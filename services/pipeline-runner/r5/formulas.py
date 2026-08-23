"""R5 selector formulas."""

from __future__ import annotations


def r5_production_formula() -> str:
    return '{Test_Run_ID}=BLANK()'


def r5_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace("'", "\\'")
    if test_run_id:
        return f'AND(RECORD_ID()="{quoted_id}",{{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}")'
    return f'AND(RECORD_ID()="{quoted_id}",{{Test_Run_ID}}=BLANK())'
