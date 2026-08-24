"""C7 processor — finalize gate then C8 (Make 5589819)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CONTENT_ITEMS_TABLE
from c7.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.mapping import c7_can_finalize, c8_include_slide
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc, stamp_minutes
from render.fields import field_str


def process_request(
    *,
    content_item_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_c8: bool = True,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "content_item_record_id": content_item_record_id,
        "test_run_id": test_run_id,
    }
    if not content_item_record_id:
        return {"processed": False, "reason": "missing_content_record_id", **preview}

    client = AirtableClient()
    parent = load_parent(client, content_item_record_id, test_run_id=test_run_id)
    if not parent:
        return {"processed": False, "reason": "parent_not_found_or_test_mismatch", **preview}

    slides = load_linked_slides(client, parent)
    preview["linked_slide_count"] = len(slides)
    preview["resolved"] = c7_can_finalize(slides)
    final_slides = [slide for slide in slides if c8_include_slide(slide)]
    preview["final_slide_ids"] = [slide["id"] for slide in final_slides]
    if not c7_can_finalize(slides):
        return {"processed": False, "reason": "unresolved_slides", **preview}
    if not final_slides:
        return {"processed": False, "reason": "no_final_approved_slides", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    platform = field_str(final_slides[0], "Platform")
    client.update_record(
        CONTENT_ITEMS_TABLE,
        parent["id"],
        {
            "Carousel_Review_Status": "Approved",
            "Render_Status": "Rendered",
            "Content_Status": "Approved",
            "Carousel_Review_Notes": (
                f"C7 finalized {platform} carousel platform set with {len(final_slides)} final approved "
                f"slides at {stamp_minutes()}. Next step: run C8."
            ),
        },
    )

    chain = None
    if trigger_c8:
        payload = {
            "content_record_id": parent["id"],
            "source": "Carousel daisy chain",
            "target": "C8",
            "requested_at": iso_utc(),
            "test_run_id": field_str(parent, "Test_Run_ID"),
        }

        def _python_c8() -> dict[str, Any]:
            from c8.processor import process_request as process_c8

            return process_c8(
                content_item_record_id=parent["id"],
                test_run_id=field_str(parent, "Test_Run_ID") or None,
            )

        chain = trigger_next("c8", payload, python_call=_python_c8)

    return {"processed": True, "c8": chain, **preview}
