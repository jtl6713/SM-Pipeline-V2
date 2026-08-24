"""C8 processor — create/update carousel platform outputs (Make 5589822)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from c8.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.constants import C8_EXISTING_OUTPUTS_VIEW
from carousel.formulas import c8_existing_output_formula
from carousel.mapping import c8_group_key, c8_include_slide, platform_output_mapping
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc, stamp_minutes
from render.fields import field, field_str


def _slide_note(slide: dict[str, Any]) -> str:
    return (
        f"Slide {field(slide, 'Slide Number')} | {field_str(slide, 'Slide Name')} | "
        f"File ID: {field_str(slide, 'Final Google Drive File ID')} | "
        f"URL: {field_str(slide, 'Final Image URL')}"
    )


def _output_fields(parent: dict[str, Any], slides: list[dict[str, Any]], *, created: bool) -> dict[str, Any]:
    first = slides[0]
    platform = field_str(first, "Platform")
    ratio = field_str(first, "AI Image Ratio") or field_str(first, "Aspect Ratio")
    fmt, output_type = platform_output_mapping(platform)
    content_id = field(parent, "Content_ID")
    title = field_str(parent, "Content_Title")
    header = (
        "Created by C8 v30.3 group-first complete-array upsert with single C9 handoff."
        if created
        else "Updated by C8 v30.3 group-first complete-array upsert with publish-state idempotency."
    )
    notes = (
        f"{header}\n"
        f"Content ID: {content_id}\n"
        f"Platform: {platform}\n"
        f"Slide count: {len(slides)}\n"
        "Package type: carousel / multi-image still set.\n\n"
        "Final slide assets:\n"
        + "\n".join(_slide_note(slide) for slide in slides)
        + "\n\nPublishing note: linked Carousel Slides are the source of truth. "
        "Final_File_URL, Output_URL, Thumbnail_URL, and Final_File_ID intentionally point "
        "to the first ordered slide for preview compatibility."
    )
    fields = {
        "Test_Run_ID": field_str(parent, "Test_Run_ID") or None,
        "Content_Item": [parent["id"]],
        "Platform": platform,
        "Format": fmt,
        "Platform_Output_Type": output_type,
        "Aspect_Ratio": ratio,
        "Output_Title": f"{title} - {platform} Carousel",
        "Output_Caption": field_str(parent, "Caption"),
        "Output_Hashtags": field_str(parent, "Hashtags"),
        "Voiceover_URL": field_str(parent, "Voiceover_URL"),
        "Output_Status": "Approved",
        "Review_Status": "Approved",
        "Render_Status": "Rendered",
        "Final_File_Storage_Status": "Uploaded",
        "Do_Not_Publish": False,
        "Final_File_Name": f"CI-{content_id}_{platform}_Carousel_{len(slides)}-slides",
        "Final_File_ID": field_str(first, "Final Google Drive File ID"),
        "Output_URL": field_str(first, "Final Image URL"),
        "Thumbnail_URL": field_str(first, "Final Image URL"),
        "Final_File_URL": field_str(first, "Final Image URL"),
        "Output_Notes": notes,
    }
    if created:
        fields["Publish_Status"] = "Not Ready"
    return {key: value for key, value in fields.items() if value not in (None, "")}


def _find_existing(
    client: AirtableClient,
    *,
    content_id: Any,
    platform: str,
    ratio: str,
    test_run_id: str,
) -> dict[str, Any] | None:
    rows = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        formula=c8_existing_output_formula(
            content_id=str(content_id or ""),
            platform=platform,
            ratio=ratio,
            test_run_id=test_run_id,
        ),
        view=C8_EXISTING_OUTPUTS_VIEW,
        max_records=5,
    )
    return rows[0] if rows else None


def _trigger_c9(output_id: str, test_run_id: str | None) -> dict[str, Any]:
    payload = {
        "output_record_id": output_id,
        "source": "Carousel daisy chain",
        "target": "C9",
        "requested_at": iso_utc(),
        "test_run_id": test_run_id or "",
    }

    def _python_c9() -> dict[str, Any]:
        from c9.processor import process_request as process_c9

        return process_c9(output_record_id=output_id, test_run_id=test_run_id)

    return trigger_next("c9", payload, python_call=_python_c9)


def process_request(
    *,
    content_item_record_id: str | None,
    test_run_id: str | None = None,
    dry_run: bool = False,
    trigger_c9: bool = True,
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

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for slide in load_linked_slides(client, parent):
        if not c8_include_slide(slide):
            continue
        platform = field_str(slide, "Platform")
        ratio = field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio")
        groups[c8_group_key(parent["id"], platform, ratio)].append(slide)

    preview["group_keys"] = list(groups)
    preview["slide_counts"] = {key: len(items) for key, items in groups.items()}
    if not groups:
        return {"processed": False, "reason": "no_final_approved_slides", **preview}
    if dry_run:
        return {"processed": False, "dry_run": True, **preview}

    results: list[dict[str, Any]] = []
    for slides in groups.values():
        first = slides[0]
        platform = field_str(first, "Platform")
        ratio = field_str(first, "AI Image Ratio") or field_str(first, "Aspect Ratio")
        existing = _find_existing(
            client,
            content_id=field(parent, "Content_ID"),
            platform=platform,
            ratio=ratio,
            test_run_id=field_str(parent, "Test_Run_ID"),
        )
        if existing:
            client.update_record(
                PLATFORM_OUTPUTS_TABLE,
                existing["id"],
                _output_fields(parent, slides, created=False),
                typecast=True,
            )
            output_id = existing["id"]
            created = False
            should_c9 = field_str(existing, "Publish_Status") == "Not Ready"
        else:
            created_rows = client.create_records(
                PLATFORM_OUTPUTS_TABLE,
                [_output_fields(parent, slides, created=True)],
                typecast=True,
            )
            output_id = created_rows[0]["id"]
            created = True
            should_c9 = True

        for slide in slides:
            client.update_record(
                CAROUSEL_SLIDES_TABLE,
                slide["id"],
                {"Platform Output": [output_id]},
                typecast=True,
            )

        client.update_record(
            CONTENT_ITEMS_TABLE,
            parent["id"],
            {
                "Carousel_Review_Status": "Approved",
                "Render_Status": "Rendered",
                "Content_Status": "Approved",
                "Carousel_Review_Notes": (
                    f"C8 {'created' if created else 'updated'} Platform Output {output_id} for {platform} "
                    f"carousel package with {len(slides)} slides at {stamp_minutes()}. "
                    f"Grouped key: {parent['id']}|{platform}|{ratio}."
                ),
            },
        )
        chain = _trigger_c9(output_id, field_str(parent, "Test_Run_ID") or None) if trigger_c9 and should_c9 else None
        results.append({"output_record_id": output_id, "created": created, "c9": chain, "slide_count": len(slides)})

    return {"processed": True, "outputs": results, **preview}
