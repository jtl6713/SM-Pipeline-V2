"""Colorful 3D block-letter cover for finished passthrough (no Remotion, no on-file text)."""

from __future__ import annotations

import logging
from typing import Any

from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE
from branding.watermark import apply_watermark_bytes, brand_watermark_bytes
from integrations.google_drive import GoogleDriveClient
from integrations.r2_upload import R2UploadClient
from item4.settings import PipelineSettings
from p2.constants import THUMBNAIL_DRIVE_FOLDER_ID
from p2.thumbnail_client import generate_thumbnail_png
from render.fields import field_str
from studio_produce.job import utc_now
from studio_produce.thumbnail_prompt import build_finished_thumbnail_prompt

logger = logging.getLogger("pipeline-runner.studio-produce")


def _public_thumb_url(client, parent_id: str, png_bytes: bytes) -> str | None:
    try:
        r2 = R2UploadClient(PipelineSettings(client))
        key = f"{r2._preview_prefix()}/thumbnails/{parent_id}/cover.png"
        r2.put_object(key, png_bytes, "image/png")
        return r2.preview_url(key)
    except Exception as error:
        logger.warning("finished thumbnail R2 upload skipped: %s", error)
        return None


def ensure_finished_thumbnail(
    client,
    request: dict[str, Any],
    parent: dict[str, Any] | None,
    outputs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not parent:
        raise RuntimeError("A promoted Content Item is required before the finished 3D thumbnail can be generated")
    existing = field_str(parent, "Thumbnail_URL")
    if existing:
        _stamp_outputs(client, outputs or [], existing)
        return {"url": existing, "generated": False}
    prompt = build_finished_thumbnail_prompt(request, parent)
    raw = generate_thumbnail_png(prompt)
    png = apply_watermark_bytes(raw, brand_watermark_bytes(client), output_format="png")
    drive = GoogleDriveClient()
    content_id = field_str(parent, "Content_ID") or parent["id"]
    thumb_file = drive.upload_and_share(
        THUMBNAIL_DRIVE_FOLDER_ID,
        f"{content_id}_thumb.png",
        png,
        "image/png",
    )
    public = _public_thumb_url(client, parent["id"], png)
    url = public or str(thumb_file.get("webContentLink") or "").strip()
    if not url:
        raise RuntimeError("Finished thumbnail generated but no public or Drive URL was returned")
    client.update_record(
        CONTENT_ITEMS_TABLE,
        parent["id"],
        {
            "Thumbnail_URL": url,
            "Thumbnail_Status": "Generated",
            "Include_Thumbnail": "Yes",
            "Include_Voiceover": "No",
            "Voiceover_Status": "Not Needed",
            "Thumbnail_Prompt": prompt,
            "Thumbnail_Google_Drive_File_ID": thumb_file.get("id"),
            "Content_Status": "Thumbnail Ready",
            "Updated_At": utc_now(),
        },
        typecast=True,
    )
    _stamp_outputs(client, outputs or [], url)
    return {"url": url, "generated": True, "drive_file_id": thumb_file.get("id")}


def _stamp_outputs(client, outputs: list[dict[str, Any]], url: str) -> None:
    for output in outputs:
        if field_str(output, "Thumbnail_URL") == url:
            continue
        client.update_record(
            PLATFORM_OUTPUTS_TABLE,
            output["id"],
            {"Thumbnail_URL": url},
            typecast=True,
        )
