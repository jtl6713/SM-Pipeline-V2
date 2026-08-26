"""C2 processor — generate Make-AI carousel slides (Make 5582071)."""

from __future__ import annotations

from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE
from carousel.chain import trigger_next
from carousel.constants import C2_DRIVE_FOLDER_ID
from carousel.image_gen import build_c2_prompt, generate_carousel_png
from carousel.mapping import c2_should_generate, cover_token, ratio_filename_token
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc
from c2.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from integrations.google_drive import GoogleDriveClient
from render.fields import field, field_str

_RUNNING_PARENTS: set[str] = set()


def _filename(parent: dict[str, Any], slide: dict[str, Any]) -> str:
    content_id = field(parent, "Content_ID") or field_str(parent, "Content_ID") or "x"
    platform = field_str(slide, "Platform") or "Instagram"
    number = field(slide, "Slide Number") or 1
    ratio = ratio_filename_token(field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio"))
    kind = cover_token(field(slide, "Is Cover"))
    return f"CSM_CI-{content_id}_{platform}_Slide-{number}_{ratio}_{kind}_MakeAI.png"


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
    if content_item_record_id in _RUNNING_PARENTS:
        return {"processed": False, "reason": "already_running", **preview}

    client = AirtableClient()
    parent = load_parent(client, content_item_record_id, test_run_id=test_run_id)
    if not parent:
        return {"processed": False, "reason": "parent_not_found_or_test_mismatch", **preview}

    slides = load_linked_slides(client, parent)
    eligible = [slide for slide in slides if c2_should_generate(slide)]
    preview["linked_slide_count"] = len(slides)
    preview["eligible_slide_ids"] = [slide["id"] for slide in eligible]
    if dry_run:
        return {
            "processed": False,
            "dry_run": True,
            "filenames": [_filename(parent, slide) for slide in eligible],
            **preview,
        }
    if not eligible:
        return {"processed": False, "reason": "no_make_ai_slides_with_prompt", **preview}

    _RUNNING_PARENTS.add(content_item_record_id)
    try:
        drive = GoogleDriveClient()
        generated: list[str] = []
        for slide in eligible:
            prompt = build_c2_prompt(
                field_str(slide, "AI Prompt"),
                platform=field_str(slide, "Platform"),
                ratio=field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio"),
            )
            png = generate_carousel_png(
                prompt,
                ratio=field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio"),
            )
            uploaded = drive.upload_and_share(
                C2_DRIVE_FOLDER_ID,
                _filename(parent, slide),
                png,
                "image/png",
            )
            link = str(uploaded.get("webContentLink") or "")
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {
                    "Google Drive File ID": uploaded["id"],
                    "Render Status": "Not Started",
                    "AI Image URL": link,
                    "Image Source": "Make AI Generated",
                    "Current Image URL": link,
                    "Error Message": "",
                    "Review Status": "Generated",
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

        return {
            "processed": True,
            "generated_slide_ids": generated,
            "c3": chain,
            **preview,
        }
    finally:
        _RUNNING_PARENTS.discard(content_item_record_id)
