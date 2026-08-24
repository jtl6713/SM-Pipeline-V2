"""C9 processor — mark carousel output Ready to Publish (Make 5589932)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PLATFORM_OUTPUTS_TABLE
from c9.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.constants import C9_READY_OUTPUT_VIEW
from carousel.formulas import exact_record_formula
from carousel.mapping import c8_include_slide
from carousel.parent import load_linked_slides, load_parent
from render.fields import field, field_str, first_linked_id


def process_request(
    *,
    output_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "output_record_id": output_record_id,
        "test_run_id": test_run_id,
    }
    if not output_record_id:
        return {"processed": False, "reason": "missing_output_record_id", **preview}

    client = AirtableClient()
    outputs = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=exact_record_formula(output_record_id, test_run_id or ""),
        view=C9_READY_OUTPUT_VIEW,
        max_records=1,
    )
    if not outputs:
        return {"processed": False, "reason": "output_not_ready_or_test_mismatch", **preview}
    output = outputs[0]
    output_test = field_str(output, "Test_Run_ID")
    parent_id = first_linked_id(field(output, "Content_Item"))
    parent = load_parent(client, parent_id, test_run_id=output_test or None) if parent_id else None
    if not parent:
        return {"processed": False, "reason": "parent_not_found_or_test_mismatch", **preview}
    slides = []
    for slide in load_linked_slides(client, parent):
        linked = field(slide, "Platform Output") or []
        linked_ids = [
            item if isinstance(item, str) else str((item or {}).get("id") or "")
            for item in (linked if isinstance(linked, list) else [linked])
        ]
        if output["id"] in linked_ids and c8_include_slide(slide):
            slides.append(slide)
    slides.sort(
        key=lambda row: (
            int(field(row, "Slide Number") or 0),
            field_str(row, "Platform"),
            field_str(row, "Slide Name"),
        )
    )
    preview["final_slide_ids"] = [slide["id"] for slide in slides]
    if not slides:
        return {"processed": False, "reason": "no_final_linked_slides", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], {"Publish_Status": "Ready to Publish"})
    return {"processed": True, "publish_status": "Ready to Publish", **preview}
