"""C6 processor — watermark approved slides (Make 5589218)."""

from __future__ import annotations

from typing import Any

import requests

from airtable.client import AirtableClient
from airtable.constants import CAROUSEL_SLIDES_TABLE, MEDIA_ASSETS_TABLE
from c6.constants import MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME
from carousel.chain import trigger_next
from carousel.constants import (
    C6_DRIVE_FOLDER_ID,
    C6_WATERMARK_ASSET_VIEW,
    DEFAULT_WATERMARK_SERVICE_URL,
    SETTING_WATERMARK_URL,
)
from carousel.mapping import cover_token
from carousel.parent import load_linked_slides, load_parent
from carousel.timeutil import iso_utc
from config import load_settings
from integrations.google_drive import GoogleDriveClient
from item4.settings import pipeline_settings
from render.fields import field, field_str


def _watermark_service_url() -> str:
    settings = load_settings()
    configured = str(settings.get("watermark_service_url") or "").strip()
    from_airtable = pipeline_settings().get(SETTING_WATERMARK_URL)
    return (configured or from_airtable or DEFAULT_WATERMARK_SERVICE_URL).rstrip("/")


def _watermark_asset_url(client: AirtableClient) -> str:
    rows = client.list_records(MEDIA_ASSETS_TABLE, view=C6_WATERMARK_ASSET_VIEW, max_records=1)
    if not rows:
        raise RuntimeError("C6 watermark asset view returned no active branding watermark")
    url = field_str(rows[0], "Google Drive URL")
    if not url:
        raise RuntimeError("C6 watermark asset is missing Google Drive URL")
    return url


def _watermark_png(*, image_url: str, watermark_url: str) -> bytes:
    service = _watermark_service_url()
    response = requests.post(
        f"{service}/watermark-image",
        headers={"Content-Type": "application/json"},
        json={
            "imageUrl": image_url,
            "watermarkUrl": watermark_url,
            "position": "top-left",
            "scale": 0.12,
            "margin": 30,
            "opacity": 1,
            "outputFormat": "png",
        },
        timeout=300,
    )
    if not response.ok:
        detail = (response.text or "").strip()[:300]
        raise RuntimeError(f"Watermark service failed ({response.status_code}): {detail}")
    return response.content


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
            "watermark_service": _watermark_service_url(),
            **preview,
        }
    if not slides:
        return {"processed": False, "reason": "no_slides_with_current_image", **preview}

    watermark_url = _watermark_asset_url(client)
    drive = GoogleDriveClient()
    watermarked: list[str] = []
    for slide in slides:
        png = _watermark_png(image_url=field_str(slide, "Current Image URL"), watermark_url=watermark_url)
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
