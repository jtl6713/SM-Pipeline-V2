"""P4 missing-asset handoff — now in-process Python P4 (Make 5533802 archived)."""

from __future__ import annotations

from typing import Any


def _field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


def trigger_p4(output: dict[str, Any], *, reason: str, source: str = "R2 python") -> dict[str, Any]:
    from p4.processor import process_one

    test_run_id = str(_field(output, "Test_Run_ID") or "").strip() or None
    result = process_one(
        output_record_id=output.get("id"),
        output_id=str(_field(output, "Output_ID") or "").strip() or None,
        test_run_id=test_run_id,
        dry_run=False,
        trigger_p5=True,
    )
    return {
        "backend": "python",
        "source": source,
        "reason": reason,
        "result": result,
    }
