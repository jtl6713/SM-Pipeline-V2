"""C4 processor — apply slide review decision and daisy-chain (Make 5587860)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE
from c4.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.formulas import exact_record_formula
from carousel.mapping import c4_route
from carousel.parent import parent_id_from_slide
from carousel.timeutil import iso_utc, stamp_minutes
from render.fields import field_str


def _load_slide(client: AirtableClient, slide_record_id: str, test_run_id: str | None) -> dict[str, Any] | None:
    rows = client.list_records(
        CAROUSEL_SLIDES_TABLE,
        formula=exact_record_formula(slide_record_id, test_run_id or ""),
        view=None,
        max_records=1,
    )
    return rows[0] if rows else None


def process_request(
    *,
    slide_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_next_stage: bool = True,
) -> dict[str, Any]:
    preview = {
        "make_scenario_id": MAKE_SCENARIO_ID,
        "make_scenario_name": MAKE_SCENARIO_NAME,
        "slide_record_id": slide_record_id,
        "test_run_id": test_run_id,
    }
    if not slide_record_id:
        return {"processed": False, "reason": "missing_slide_record_id", **preview}

    client = AirtableClient()
    slide = _load_slide(client, slide_record_id, test_run_id)
    if not slide:
        return {"processed": False, "reason": "slide_not_found_or_test_mismatch", **preview}

    route = c4_route(slide)
    preview["route"] = route
    preview["review_status"] = field_str(slide, "Review Status")
    if not route:
        return {"processed": False, "reason": "no_pending_decision", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    parent_id = parent_id_from_slide(slide)
    parent_test = field_str(slide, "Test_Run_ID")
    chain = None

    if route == "approved":
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "Render Status": "Not Started",
                "Deleted From Carousel": False,
                "Replacement Requested": False,
                "Approved For Final": True,
                "Error Message": "",
            },
        )
        payload = {
            "content_record_id": parent_id,
            "source": "Carousel daisy chain",
            "target": "C6",
            "requested_at": iso_utc(),
            "test_run_id": parent_test,
        }

        def _python_c6() -> dict[str, Any]:
            from c6.processor import process_request as process_c6

            return process_c6(content_item_record_id=parent_id, test_run_id=parent_test or None)

        chain = trigger_next("c6", payload, python_call=_python_c6) if trigger_next_stage else {"backend": "skipped", "stage": "c6"}

    elif route == "delete":
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "Deleted From Carousel": True,
                "Replacement Requested": False,
                "Approved For Final": False,
                "Error Message": "",
                "Review Status": "Deleted",
            },
        )
        if parent_id:
            client.update_record(
                CONTENT_ITEMS_TABLE,
                parent_id,
                {
                    "Carousel_Review_Status": "Revise Carousel",
                    "Carousel_Review_Notes": (
                        f"C4 processed a deleted slide decision for {field_str(slide, 'Slide Name')} / "
                        f"{field_str(slide, 'Platform')} at {stamp_minutes()}."
                    ),
                },
            )
        payload = {
            "content_record_id": parent_id,
            "source": "Carousel daisy chain",
            "target": "C7",
            "requested_at": iso_utc(),
            "test_run_id": parent_test,
        }

        def _python_c7() -> dict[str, Any]:
            from c7.processor import process_request as process_c7

            return process_c7(content_item_record_id=parent_id, test_run_id=parent_test or None)

        chain = trigger_next("c7", payload, python_call=_python_c7) if trigger_next_stage else {"backend": "skipped", "stage": "c7"}

    else:
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "Render Status": "Not Started",
                "Deleted From Carousel": False,
                "Replacement Requested": True,
                "Approved For Final": False,
                "Error Message": "",
            },
        )
        if parent_id:
            client.update_record(
                CONTENT_ITEMS_TABLE,
                parent_id,
                {
                    "Carousel_Review_Status": "Revise Carousel",
                    "Carousel_Review_Notes": (
                        f"C4 queued a regeneration decision for {field_str(slide, 'Slide Name')} / "
                        f"{field_str(slide, 'Platform')} at {stamp_minutes()}. Run C5 to regenerate."
                    ),
                },
            )
        payload = {
            "content_record_id": parent_id,
            "source": "Carousel daisy chain",
            "target": "C5",
            "requested_at": iso_utc(),
            "test_run_id": parent_test,
        }

        def _python_c5() -> dict[str, Any]:
            from c5.processor import process_request as process_c5

            return process_c5(content_item_record_id=parent_id, test_run_id=parent_test or None)

        chain = trigger_next("c5", payload, python_call=_python_c5) if trigger_next_stage else {"backend": "skipped", "stage": "c5"}

    return {"processed": True, "next": chain, **preview}
