"""Airtable selectors for P4 — Make 5533802 module 42."""

from __future__ import annotations


def _quote(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def p4_output_id_formula(output_id: str | int, test_run_id: str = "") -> str:
    identity = (
        f'{{Test_Run_ID}}="{_quote(test_run_id)}"'
        if test_run_id
        else "{Test_Run_ID}=BLANK()"
    )
    return f"AND({{Output_ID}}={int(output_id)},{identity})"


def p4_exact_record_formula(output_record_id: str, test_run_id: str = "") -> str:
    identity = (
        f'{{Test_Run_ID}}="{_quote(test_run_id)}"'
        if test_run_id
        else "{Test_Run_ID}=BLANK()"
    )
    return f'AND(RECORD_ID()="{_quote(output_record_id)}",{identity})'


def p4_content_item_formula(content_item_id: str) -> str:
    return f'RECORD_ID()="{_quote(content_item_id)}"'
