"""C6 processor — watermark approved slides (Make 5589218)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from branding.watermark import brand_watermark_url, watermark_image_from_url, watermark_service_url
from c6.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.constants import C6_DRIVE_FOLDER_ID
from carousel.mapping import cover_token
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str


def _filename(parent: dict[str, Any], slide: dict[str, Any]) -> str:
    content_id = field(parent, "Content_ID") or "x"
    platform = field_str(slide, "Platform") or "Instagram"
    number = field(slide, "Slide Number") or 1
    kind = cover_token(field(slide, "Is Cover"))
    return f"CSM_CI-{content_id}_{platform}_Slide-{number}_{kind}_WM.png"


def process_request(
    *,
    content_item_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_c7: bool = True,
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

    slides = [
        slide
        for slide in load_linked_slides(client, parent)
        if field_str(slide, "Current Image URL")
    ]
    preview["eligible_slide_ids"] = [slide["id"] for slide in slides]
    if dry_run:
        return {
            "processed": False,
            "dry_run": True,
            "watermark_service": watermark_service_url(),
            **preview,
        }
    if not slides:
        return {"processed": False, "reason": "no_slides_with_current_image", **preview}

    watermark_url = brand_watermark_url(client)
    drive = GoogleDriveClient()
    watermarked: list[str] = []
    for slide in slides:
        png = watermark_image_from_url(
            image_url=field_str(slide, "Current Image URL"),
            watermark_url=watermark_url,
            output_format="png",
        )
        uploaded = drive.upload_and_share(
            C6_DRIVE_FOLDER_ID,
            _filename(parent, slide),
            png,
            "image/png",
        )
        link = str(uploaded.get("webContentLink") or "")
        client.update_record(
            CAROUSEL_SLIDES_TABLE,
            slide["id"],
            {
                "Final Image URL": link,
                "Watermarked Image URL": link,
                "Render Status": "Rendered",
                "Review Status": "Final Approved",
                "Error Message": "",
                "Final Google Drive File ID": uploaded["id"],
            },
        )
        watermarked.append(slide["id"])

    chain = None
    if trigger_c7 and watermarked:
        payload = {
            "content_record_id": parent["id"],
            "source": "Carousel daisy chain",
            "target": "C7",
            "requested_at": iso_utc(),
            "test_run_id": field_str(parent, "Test_Run_ID"),
        }

        def _python_c7() -> dict[str, Any]:
            from c7.processor import process_request as process_c7

            return process_c7(
                content_item_record_id=parent["id"],
                test_run_id=field_str(parent, "Test_Run_ID") or None,
            )

        chain = trigger_next("c7", payload, python_call=_python_c7)

    return {"processed": True, "watermarked_slide_ids": watermarked, "c7": chain, **preview}
