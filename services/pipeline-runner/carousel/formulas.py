"""Test-run identity and carousel selectors — aligned with Make C2–C9."""

from __future__ import annotations


def test_run_guard(test_run_id: str = "") -> str:
    cleaned = (test_run_id or "").replace('"', "")
    if cleaned:
        return f'{{Test_Run_ID}}="{cleaned}"'
    return "{Test_Run_ID}=BLANK()"


def exact_record_formula(record_id: str, test_run_id: str = "") -> str:
    quoted = (record_id or "").replace("'", "\\'")
    return f'AND(RECORD_ID()="{quoted}",{test_run_guard(test_run_id)})'


def matches_test_run(record_value: str | None, webhook_value: str | None) -> bool:
    record = str(record_value or "").strip()
    webhook = str(webhook_value or "").strip()
    if not webhook:
        return not record
    return webhook == record


def c8_existing_output_formula(*, content_id: str, platform: str, ratio: str, test_run_id: str = "") -> str:
    cid = str(content_id or "").replace('"', "")
    plat = str(platform or "").replace('"', "")
    aspect = str(ratio or "").replace('"', "")
    return (
        "AND("
        f'FIND(",{cid},", "," & ARRAYJOIN({{Content_Item}}) & ",") > 0,'
        f'{{Platform}}="{plat}",'
        f'{{Aspect_Ratio}}="{aspect}",'
        f"{test_run_guard(test_run_id)}"
        ")"
    )


def c9_slides_for_output_formula(output_record_id: str, test_run_id: str = "") -> str:
    oid = (output_record_id or "").replace('"', "")
    return (
        "AND("
        f'FIND("{oid}", ARRAYJOIN({{Platform_Output}})) > 0,'
        f"{test_run_guard(test_run_id)}"
        ")"
    )
