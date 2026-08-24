"""Airtable selectors for R2B — Make 5576620 module 1."""

from __future__ import annotations

PRODUCTION_FORMULA = "{Test_Run_ID}=BLANK()"


def r2b_production_formula() -> str:
    return PRODUCTION_FORMULA


def r2b_exact_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    quoted_id = output_record_id.replace('"', "")
    test_guard = (
        f'{{Test_Run_ID}}="{test_run_id.replace(chr(34), "")}"'
        if test_run_id
        else "{Test_Run_ID}=BLANK()"
    )
    return f'AND(RECORD_ID()="{quoted_id}",{test_guard})'
