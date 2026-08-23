"""Lightweight SMV1 processor tests (no live Airtable)."""

from item4.formulas import queue_row_is_outstanding, smv1_exact_request_formula


def test_exact_request_formula_blank_test():
    formula = smv1_exact_request_formula("recABC123", "")
    assert "recABC123" in formula
    assert "{Test_Run_ID}=BLANK()" in formula


def test_exact_request_formula_test_run():
    formula = smv1_exact_request_formula("recABC123", "TR-1")
    assert '{Test_Run_ID}="TR-1"' in formula


def test_outstanding_pending():
    assert queue_row_is_outstanding({"Transfer_Status": "Pending"})


def test_outstanding_preview():
    assert queue_row_is_outstanding({"Transfer_Status": "Ready", "Preview_Status": "Pending"})


def test_not_outstanding_ready_preview():
    assert not queue_row_is_outstanding({"Transfer_Status": "Ready", "Preview_Status": "Ready"})
