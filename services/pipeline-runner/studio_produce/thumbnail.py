"""Colorful 3D block-letter cover sized to each Platform Output aspect ratio."""

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
from studio_produce.thumbnail_prompt import build_finished_thumbnail_prompt

logger = logging.getLogger("pipeline-runner.studio-produce")

VIDEO_COVER_SUFFIXES = (".mp4", ".mov", ".m4v", ".webm")


def is_designed_cover_url(url: Any) -> bool:
    """True only for a generated 3D still. Drive fetches and video files are not covers."""
    href = str(url or "").strip()
    if not href:
        return False
    lower = href.lower()
    if "item4-variant-fill-crop" in lower:
        return False
    if "drive.google.com" in lower or "/uc?id=" in lower or "googleusercontent.com" in lower:
        return False
    path = lower.split("?", 1)[0]
    if path.endswith(VIDEO_COVER_SUFFIXES):
        return False
    if "/studio/previews/clip-posters/" in lower:
        return False
    return True


def _public_thumb_url(client, parent_id: str, png_bytes: bytes, *, ratio_token: str = "9x16") -> str | None:
    try:
        r2 = R2UploadClient(PipelineSettings(client))
        key = f"{r2._preview_prefix()}/thumbnails/{parent_id}/cover-{ratio_token}.png"
        r2.put_object(key, png_bytes, "image/png")
        return r2.preview_url(key)
    except Exception as error:
        logger.warning("finished thumbnail R2 upload skipped: %s", error)
        return None


def _normalize_ratio(value: Any) -> str:
    ratio = str(value or "").replace("x", ":").strip()
    return ratio or "9:16"


def _ratio_token(ratio: str) -> str:
    return _normalize_ratio(ratio).replace(":", "x")


def _generate_cover_bytes(
    client,
    request: dict[str, Any],
    parent: dict[str, Any],
    *,
    aspect_ratio: str,
) -> tuple[bytes, str]:
    prompt = build_finished_thumbnail_prompt(request, parent, aspect_ratio=aspect_ratio)
    raw = generate_thumbnail_png(prompt, aspect_ratio=aspect_ratio)
    png = apply_watermark_bytes(raw, brand_watermark_bytes(client), output_format="png")
    return png, prompt


def ensure_finished_thumbnail(
    client,
    request: dict[str, Any],
    parent: dict[str, Any] | None,
    outputs: list[dict[str, Any]] | None = None,
    *,
    aspect_ratio: str = "9:16",
    force: bool = False,
) -> dict[str, Any]:
    if not parent:
        raise RuntimeError("A promoted Content Item is required before the finished 3D thumbnail can be generated")
    ratio = _normalize_ratio(aspect_ratio)
    existing = field_str(parent, "Thumbnail_URL")
    if is_designed_cover_url(existing) and not force:
        _stamp_outputs(client, outputs or [], existing)
        return {"url": existing, "generated": False, "aspect_ratio": ratio}

    png, prompt = _generate_cover_bytes(client, request, parent, aspect_ratio=ratio)
    drive = GoogleDriveClient()
    content_id = field_str(parent, "Content_ID") or parent["id"]
    token = _ratio_token(ratio)
    thumb_file = drive.upload_and_share(
        THUMBNAIL_DRIVE_FOLDER_ID,
        f"{content_id}_thumb_{token}.png",
        png,
        "image/png",
    )
    public = _public_thumb_url(client, parent["id"], png, ratio_token=token)
    url = public or str(thumb_file.get("webContentLink") or "").strip()
    if not url:
        raise RuntimeError("Finished thumbnail generated but no public or Drive URL was returned")
    # Do not write Updated_At (Airtable rejects it) or clear voiceover fields.
    client.update_record(
        CONTENT_ITEMS_TABLE,
        parent["id"],
        {
            "Thumbnail_URL": url,
            "Thumbnail_Status": "Generated",
            "Include_Thumbnail": "Yes",
            "Thumbnail_Prompt": prompt,
            "Thumbnail_Google_Drive_File_ID": thumb_file.get("id"),
            "Content_Status": "Thumbnail Ready",
        },
        typecast=True,
    )
    _stamp_outputs(client, outputs or [], url)
    return {"url": url, "generated": True, "drive_file_id": thumb_file.get("id"), "aspect_ratio": ratio}


def ensure_platform_thumbnails(
    client,
    request: dict[str, Any],
    parent: dict[str, Any] | None,
    outputs: list[dict[str, Any]] | None = None,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Generate one cover per distinct Platform Output aspect ratio and stamp each row."""
    if not parent:
        raise RuntimeError("A promoted Content Item is required before platform thumbnails can be generated")
    rows = list(outputs or [])
    by_ratio: dict[str, list[dict[str, Any]]] = {}
    for output in rows:
        ratio = _normalize_ratio(field_str(output, "Aspect_Ratio") or "9:16")
        by_ratio.setdefault(ratio, []).append(output)

    if not by_ratio:
        by_ratio["9:16"] = []

    results = []
    primary_url = ""
    for ratio, group in sorted(by_ratio.items(), key=lambda item: (0 if item[0] == "9:16" else 1, item[0])):
        # Prefer regenerating when force, else reuse matching CI thumb only for primary 9:16.
        if (
            not force
            and ratio == "9:16"
            and is_designed_cover_url(field_str(parent, "Thumbnail_URL"))
            and "cover-9x16" in field_str(parent, "Thumbnail_URL")
        ):
            url = field_str(parent, "Thumbnail_URL")
            _stamp_outputs(client, group, url)
            primary_url = primary_url or url
            results.append({"aspect_ratio": ratio, "url": url, "generated": False, "output_count": len(group)})
            continue

        png, prompt = _generate_cover_bytes(client, request, parent, aspect_ratio=ratio)
        drive = GoogleDriveClient()
        content_id = field_str(parent, "Content_ID") or parent["id"]
        token = _ratio_token(ratio)
        thumb_file = drive.upload_and_share(
            THUMBNAIL_DRIVE_FOLDER_ID,
            f"{content_id}_thumb_{token}.png",
            png,
            "image/png",
        )
        public = _public_thumb_url(client, parent["id"], png, ratio_token=token)
        url = public or str(thumb_file.get("webContentLink") or "").strip()
        if not url:
            raise RuntimeError(f"Thumbnail generated for {ratio} but no public or Drive URL was returned")
        _stamp_outputs(client, group, url)
        if ratio == "9:16" or not primary_url:
            primary_url = url
            client.update_record(
                CONTENT_ITEMS_TABLE,
                parent["id"],
                {
                    "Thumbnail_URL": url,
                    "Thumbnail_Status": "Generated",
                    "Include_Thumbnail": "Yes",
                    "Thumbnail_Prompt": prompt,
                    "Thumbnail_Google_Drive_File_ID": thumb_file.get("id"),
                    "Content_Status": "Thumbnail Ready",
                },
                typecast=True,
            )
        results.append(
            {
                "aspect_ratio": ratio,
                "url": url,
                "generated": True,
                "drive_file_id": thumb_file.get("id"),
                "output_count": len(group),
            }
        )
    return {"primary_url": primary_url, "covers": results}


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
