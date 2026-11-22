"""Issue #2294: native Instagram V2 carousel media preflight (read-only).

Never create child or parent Meta objects for a missing or unapproved native
gallery. Legacy outputs without V2 selected manifest remain on their existing
reconciliation path. This checker performs no writes and has no Meta client.
"""
from __future__ import annotations

import re
from typing import Any

from asset.helpers import parse_int
from render.fields import field, field_str, parse_json_field

REC = re.compile(r"rec[A-Za-z0-9]{14}\Z")
PUBLIC = re.compile(r"https://media\.chicagoshining\.com/studio/previews/.+\.(?:jpg|jpeg|png|webp)\Z", re.I)


def native_instagram_v2_gallery(output: dict[str, Any]) -> bool:
    """Guard all V2 outputs with a typed selected count or package, even if corrupt."""
    return (
        field_str(output, "Platform_Output_Type") == "Instagram Carousel"
        and (field(output, "Selected_Clip_Count") is not None
             or field(output, "Selected_Assets_JSON") is not None)
    )


def native_instagram_gallery_preflight_reason(
    output: dict[str, Any], slides: list[dict[str, Any]],
) -> str | None:
    if not native_instagram_v2_gallery(output):
        return None
    record_id = str(output.get("id") or "")
    number = parse_int(field(output, "Output_ID"), None)
    if not REC.fullmatch(record_id) or not number or number < 1:
        return "native_ig_gallery_identity_invalid"
    selected = parse_json_field(field(output, "Selected_Assets_JSON"))
    selected = selected.get("selected_clips") if isinstance(selected, dict) else None
    rendered = parse_json_field(field(output, "Render_Clip_List_JSON"))
    total = parse_int(field(output, "Selected_Clip_Count"), None)
    if (not isinstance(selected, list) or not isinstance(rendered, list)
            or not total or total < 2 or total > 10
            or len(selected) != total or len(rendered) != total):
        return "native_ig_gallery_manifest_incomplete"
    if len(slides) != total:
        return "native_ig_gallery_canonical_slides_missing_or_partial"
    used_urls: set[str] = set()
    used_files: set[str] = set()
    for index, (candidate, render, slide) in enumerate(zip(selected, rendered, slides), start=1):
        if not all(isinstance(x, dict) for x in (candidate, render, slide)):
            return "native_ig_gallery_source_invalid"
        fields = slide.get("fields") or {}
        if not isinstance(fields, dict):
            return "native_ig_gallery_slide_fields_invalid"
        if (fields.get("Platform Output") != [record_id]
                or fields.get("PO_Output_ID") != [number]
                or parse_int(fields.get("Current Order"), None) != index
                or parse_int(fields.get("Slide Number"), None) != index
                or fields.get("Deleted From Carousel") is True):
            return "native_ig_gallery_owner_order_invalid"
        url = str(candidate.get("url") or candidate.get("src") or "").strip()
        final = str(fields.get("Asset_4x5_Public_URL") or "").strip()
        render_url = str(render.get("url") or render.get("src") or "").strip()
        if (parse_int(candidate.get("order"), None) != index
                or parse_int(render.get("order"), None) != index
                or candidate.get("aspect_ratio") != "4:5"
                or render.get("aspect_ratio") != "4:5"
                or not PUBLIC.fullmatch(url) or url in used_urls
                or url != final or url != render_url
                or str(fields.get("Asset_4x5_Public_Status") or "").casefold() != "ready"):
            return "native_ig_gallery_4x5_public_media_mismatch"
        used_urls.add(url)
        original = str(candidate.get("googleDriveFileId") or candidate.get("google_drive_file_id") or "").strip()
        family = str(candidate.get("mediaAssetRecordId") or candidate.get("media_asset_record_id") or "").strip()
        if (not original or original in used_files
                or original != str(fields.get("Google Drive File ID") or "").strip()
                or not REC.fullmatch(family)
                or family != str(fields.get("Asset_Family_Key") or "").strip()):
            return "native_ig_gallery_original_source_mismatch"
        used_files.add(original)
        if (fields.get("Shared_Asset_Approved") is not True
                or fields.get("Approved For Final") is not True
                or str(fields.get("Review Status") or "") != "Final Approved"):
            return "native_ig_gallery_creative_approval_missing"
        staged_url = str(fields.get("IG_Public_Asset_URL") or "").strip()
        if (str(fields.get("IG_Public_Asset_Status") or "").casefold() != "ready"
                or not staged_url.startswith("https://")
                or not staged_url):
            return "native_ig_gallery_instagram_public_asset_not_staged"
    return None


def inspect_instagram_native_v2_package(client: Any, output: dict[str, Any]) -> str | None:
    """Re-read canonical Supabase-shaped slides; no output/slide/Meta mutations."""
    if not native_instagram_v2_gallery(output):
        return None
    from apc.assets import list_final_slides, list_ready_public_assets
    output_number = field_str(output, "Output_ID")
    slides = list_final_slides(client, output_number)
    reason = native_instagram_gallery_preflight_reason(output, slides)
    if reason:
        # C9 final view can omit an explicitly approved cover. Accept the
        # read-only AP0C-ready fallback ONLY if exact identity/order/approval
        # validates on every canonical record; never infer completeness.
        ready = list_ready_public_assets(client, output_number)
        fallback = native_instagram_gallery_preflight_reason(output, ready)
        if fallback is None:
            return None
    return reason
