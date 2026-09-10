from __future__ import annotations

from item4.constants import SMV1_BASE_ELIGIBILITY_FORMULA


def airtable_quote(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace('"', '\\"')


def smv1_exact_request_formula(record_id: str, test_run_id: str = "") -> str:
    test_clause = (
        f'{{Test_Run_ID}}="{airtable_quote(test_run_id)}"'
        if test_run_id
        else "{Test_Run_ID}=BLANK()"
    )
    return (
        f'AND({{Production_Request_Record_ID}}="{airtable_quote(record_id)}",'
        f"{test_clause},{SMV1_BASE_ELIGIBILITY_FORMULA})"
    )


def smv1_pending_crop_formula(record_id: str, test_run_id: str = "") -> str:
    from item4.constants import SMV1_PENDING_CROP_FORMULA

    test_clause = (
        f'{{Test_Run_ID}}="{airtable_quote(test_run_id)}"'
        if test_run_id
        else "{Test_Run_ID}=BLANK()"
    )
    return (
        f'AND({{Production_Request_Record_ID}}="{airtable_quote(record_id)}",'
        f"{test_clause},{SMV1_PENDING_CROP_FORMULA})"
    )


def queue_row_is_outstanding(fields: dict) -> bool:
    status = str(fields.get("Transfer_Status") or "").strip()
    if status in {"Pending", "Drive Uploaded", "Processing"}:
        return True
    return status == "Ready" and str(fields.get("Preview_Status") or "").strip() == "Pending"
