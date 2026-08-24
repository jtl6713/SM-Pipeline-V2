"""C5 processor — regenerate rejected slides (Make 5582074)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE
from c5.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.constants import C5_DRIVE_FOLDER_ID
from carousel.image_gen import build_c5_prompt, generate_carousel_png
from carousel.mapping import c5_should_regenerate
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc, stamp_minutes
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str


def process_request(
    *,
    content_item_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_c3: bool = True,
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

    slides = [slide for slide in load_linked_slides(client, parent) if c5_should_regenerate(slide)]
    preview["eligible_slide_ids"] = [slide["id"] for slide in slides]
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}
    if not slides:
        return {"processed": False, "reason": "no_rejected_regenerate_slides", **preview}

    drive = GoogleDriveClient()
    generated: list[str] = []
    for slide in slides:
        ratio = field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio")
        prompt = build_c5_prompt(
            replacement_prompt=field_str(slide, "Replacement Prompt"),
            review_notes=field_str(slide, "Review Notes"),
            original_prompt=field_str(slide, "AI Prompt"),
            platform=field_str(slide, "Platform"),
            ratio=ratio,
        )
        png = generate_carousel_png(prompt, ratio=ratio)
        filename = (
            f"carousel_replacement_{slide['id']}_{field_str(slide, 'Platform') or 'slide'}"
            f"_slide_{field(slide, 'Slide Number') or 0}.png"
        )
        uploaded = drive.upload_and_share(C5_DRIVE_FOLDER_ID, filename, png, "image/png")
        link = str(uploaded.get("webContentLink") or "")
        count = int(field(slide, "Regeneration Count") or 0) + 1
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "Google Drive File ID": uploaded["id"],
                "Final Image URL": "",
                "Render Status": "Not Started",
                "AI Image URL": link,
                "Deleted From Carousel": False,
                "Replacement Requested": False,
                "Approved For Final": False,
                "Image Source": "Make AI Generated",
                "Regeneration Count": count,
                "Current Image URL": link,
                "Error Message": "",
                "Review Status": "Replacement Generated",
                "Image Generation Mode": "Make AI Generated",
                "C3 Review Email Sent At": None,
                "Watermarked Image URL": "",
                "Final Google Drive File ID": "",
            },
            typecast=True,
        )
        client.update_record(
            CONTENT_ITEMS_TABLE,
            parent["id"],
            {
                "Carousel_Review_Email_Sent_At": None,
                "Carousel_Review_Status": "Ready for Review",
                "Carousel_Review_Notes": (
                    f"C5 generated a replacement for {field_str(slide, 'Slide Name')} / "
                    f"{field_str(slide, 'Platform')} at {stamp_minutes()}. Run C3 again to review the replacement."
                ),
            },
        )
        generated.append(slide["id"])

    chain = None
    if trigger_c3 and generated:
        payload = {
            "content_record_id": parent["id"],
            "content_id": field(parent, "Content_ID"),
            "source": "Carousel daisy chain",
            "target": "C3",
            "requested_at": iso_utc(),
            "test_run_id": field_str(parent, "Test_Run_ID"),
        }

        def _python_c3() -> dict[str, Any]:
            from c3.processor import process_request as process_c3

            return process_c3(
                content_item_record_id=parent["id"],
                test_run_id=field_str(parent, "Test_Run_ID") or None,
            )

        chain = trigger_next("c3", payload, python_call=_python_c3)

    return {"processed": True, "generated_slide_ids": generated, "c3": chain, **preview}
