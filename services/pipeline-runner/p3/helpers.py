"""Pure P3 field helpers — no Airtable I/O."""

from __future__ import annotations

import re
from typing import Any

from p3.constants import (
    CONTENT_TYPE_FORMATS,
    DEFAULT_VOICEOVER_TAIL_SECONDS,
    NATIVE_PHOTO_OUTPUT_TYPES,
    PARENT_CONTENT_STATUS_MATCHED,
    PARENT_CONTENT_STATUS_NEEDS_ASSETS,
    PARENT_RENDER_STATUS,
    PARENT_REVIEW_STATUS,
    STUDIO_ENRICHMENT_NOTE,
)
from render.fields import field, field_str, first_linked_id


_HASHTAG_TOKEN = re.compile(r"#[^\s#]+")


def caption_with_hashtags(caption: Any, hashtags: Any) -> str:
    """Return one publishable caption with hashtag tokens appended exactly once."""
    body = str(caption or "").strip()
    raw_tags = str(hashtags or "").strip()
    if not raw_tags:
        return body

    existing = {token.casefold() for token in _HASHTAG_TOKEN.findall(body)}
    candidates = _HASHTAG_TOKEN.findall(raw_tags)
    if candidates:
        missing = [token for token in candidates if token.casefold() not in existing]
        if not missing:
            return body
        suffix = " ".join(missing)
    else:
        if raw_tags.casefold() in body.casefold():
            return body
        suffix = raw_tags
    return f"{body}\n\n{suffix}".strip()


def csv_join(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [str(item).strip() for item in value if str(item).strip()]
        return ",".join(parts)
    return str(value).strip()


def csv_has(csv_value: str, needle: str) -> bool:
    haystack = f",{csv_value},"
    return f",{needle}," in haystack


def is_native_photo(studio_output_type: str) -> bool:
    return studio_output_type.strip() in NATIVE_PHOTO_OUTPUT_TYPES


def studio_output_status(studio_output_type: str) -> str:
    return "Ready for Review" if is_native_photo(studio_output_type) else "In Production"


def studio_asset_selection_status(studio_output_type: str) -> str:
    return "" if is_native_photo(studio_output_type) else "Selected"


def effective_mode(value: Any, default: str = "Yes") -> str:
    text = str(value or "").strip()
    return text or default


def media_required(mode: Any, default: str = "Yes") -> bool:
    return effective_mode(mode, default) != "No"


def parent_media_ready(
    parent: dict[str, Any],
    *,
    thumbnail_mode: Any,
    voiceover_mode: Any,
    default_mode: str = "Yes",
) -> bool:
    if not field_str(parent, "Caption"):
        return False
    if media_required(thumbnail_mode, default_mode) and not field_str(parent, "Thumbnail_URL"):
        return False
    if media_required(voiceover_mode, default_mode) and not field_str(parent, "Voiceover_URL"):
        return False
    return True


def pick_title(output: dict[str, Any], parent: dict[str, Any]) -> str:
    requested = field_str(output, "Studio_Effective_Requested_Title")
    return requested or field_str(parent, "Content_Title")


def pick_caption(output: dict[str, Any], parent: dict[str, Any]) -> str:
    requested = field_str(output, "Studio_Effective_Requested_Caption")
    return requested or field_str(parent, "Caption")


def copied_media_url(parent: dict[str, Any], field_name: str, mode: Any) -> str:
    # Native grid covers stay on the output even when thumbnail mode is No.
    # Mode No means do not letter the video; it does not mean omit the cover.
    if field_name == "Thumbnail_URL":
        return field_str(parent, field_name)
    if not media_required(mode):
        return ""
    return field_str(parent, field_name)


def build_studio_enrichment_fields(parent: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    studio_type = field_str(output, "Studio_Output_Type")
    notes = field_str(output, "Output_Notes")
    content_id = field_str(parent, "Content_ID")
    note_line = f"{STUDIO_ENRICHMENT_NOTE} Enrichment from Content Item {content_id}."
    combined = f"{notes}\n{note_line}".strip() if notes else note_line
    return {
        "Output_Title": pick_title(output, parent),
        "Output_Caption": caption_with_hashtags(
            pick_caption(output, parent), field_str(parent, "Hashtags")
        ),
        "Output_Hashtags": field_str(parent, "Hashtags"),
        "Thumbnail_URL": copied_media_url(
            parent, "Thumbnail_URL", field(output, "Studio_Effective_Thumbnail_Mode")
        ),
        "Voiceover_URL": copied_media_url(
            parent, "Voiceover_URL", field(output, "Studio_Effective_Voiceover_Mode")
        ),
        "Output_Status": studio_output_status(studio_type),
        "Asset_Selection_Status": studio_asset_selection_status(studio_type),
        "Output_Notes": combined,
    }


def parent_mark_fields(*, source_authority_ready: bool | None = None) -> dict[str, str]:
    content_status = PARENT_CONTENT_STATUS_MATCHED
    if source_authority_ready is False:
        content_status = PARENT_CONTENT_STATUS_NEEDS_ASSETS
    return {
        "Review_Status": PARENT_REVIEW_STATUS,
        "Render_Status": PARENT_RENDER_STATUS,
        "Content_Status": content_status,
    }


def normalize_content_format(content_type: str) -> str:
    return CONTENT_TYPE_FORMATS.get(content_type.strip(), content_type.strip())


def resolve_effective_platforms(
    item: dict[str, Any],
    source: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
    production_profile: dict[str, Any] | None = None,
) -> str:
    source = source or {}
    profile = profile or {}
    production_profile = production_profile or {}
    for candidate in (
        field_str(item, "Studio_Target_Platform"),
        csv_join(field(item, "Carousel_Target_Platforms")),
        csv_join(field(source, "Production_Target_Platforms")),
        csv_join(field(profile, "Default_Platforms")),
        csv_join(field(production_profile, "Default_Platforms")),
        csv_join(field(source, "Suggested_Platforms")),
    ):
        if candidate:
            return candidate
    return ""


def resolve_effective_formats(
    item: dict[str, Any],
    source: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> str:
    source = source or {}
    profile = profile or {}
    for raw in (
        field_str(item, "Content_Type"),
        field_str(source, "Production_Content_Type"),
    ):
        mapped = normalize_content_format(raw)
        if mapped:
            return mapped
    for candidate in (
        csv_join(field(profile, "Default_Formats")),
        csv_join(field(source, "Suggested_Format")),
    ):
        if candidate:
            return candidate
    return ""


def mapping_matches(mapping: dict[str, Any], platforms_csv: str, formats_csv: str) -> bool:
    if not field(mapping, "Active"):
        return False
    platform = field_str(mapping, "Platform")
    output_format = field_str(mapping, "Format")
    platform_ok = csv_has(platforms_csv, platform) or (
        platform == "YouTube" and csv_has(platforms_csv, "YouTube Shorts")
    )
    return platform_ok and csv_has(formats_csv, output_format)


def _num(value: Any, default: float | int = 0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def voiceover_tail_seconds(item: dict[str, Any]) -> float:
    return _num(field(item, "Voiceover_Tail_Seconds"), DEFAULT_VOICEOVER_TAIL_SECONDS)


def source_authority_ready(item: dict[str, Any]) -> bool:
    return field_str(item, "Studio_Source_Authority_Status") == "Ready"


def build_legacy_output_fields(
    item: dict[str, Any],
    mapping: dict[str, Any],
    *,
    platforms_csv: str,
    formats_csv: str,
) -> dict[str, Any]:
    ready = source_authority_ready(item)
    clip_count = _num(field(item, "Studio_Source_Selected_Clip_Count"), 0)
    total_frames = _num(field(item, "Studio_Source_Render_Total_Frames"), 0)
    per_clip = round(total_frames / clip_count) if ready and clip_count else 0
    include_thumb = effective_mode(field(item, "Include_Thumbnail"))
    include_vo = effective_mode(field(item, "Include_Voiceover"))
    clip_mode = field_str(item, "Requested_Video_Clip_Count_Mode")
    carousel_mode = field_str(item, "Requested_Carousel_Slide_Count_Mode")
    production_request_id = first_linked_id(field(item, "Production_Request_Output"))
    preferred_music_id = first_linked_id(field(item, "Preferred_Music_Asset"))
    test_run_id = field_str(item, "Test_Run_ID")
    content_id = field_str(item, "Content_ID")

    fields: dict[str, Any] = {
        "Format": field_str(mapping, "Format"),
        "Platform": field_str(mapping, "Platform"),
        "Aspect_Ratio": field_str(mapping, "Aspect_Ratio"),
        "Platform_Output_Type": field_str(mapping, "Platform_Output_Type"),
        "Content_Item": [item["id"]],
        "Output_Title": field_str(item, "Content_Title"),
        "Output_Caption": caption_with_hashtags(
            field_str(item, "Caption"), field_str(item, "Hashtags")
        ),
        "Output_Hashtags": field_str(item, "Hashtags"),
        "Output_Status": "Ready for Review",
        "Asset_Need_Status": "Not Needed",
        "Studio_Output_Type": field_str(item, "Studio_Output_Type") or None,
        "Preferred_Music_URL": field_str(item, "Preferred_Music_URL") or None,
        "Studio_Output_Notes": field_str(item, "Production_Request_Notes") or None,
        "Studio_Output_Directives_JSON": field_str(item, "Production_Request_Directives_JSON") or None,
        "Studio_Effective_Title_Mode": field_str(item, "Requested_Title_Mode") or None,
        "Studio_Effective_Script_Mode": field_str(item, "Requested_Script_Mode") or None,
        "Studio_Effective_Caption_Mode": field_str(item, "Requested_Caption_Mode") or None,
        "Studio_Effective_Requested_Title": field_str(item, "Requested_Title") or None,
        "Studio_Effective_Requested_Script": field_str(item, "Requested_Script") or None,
        "Studio_Effective_Requested_Caption": field_str(item, "Requested_Caption") or None,
        "Studio_Effective_Thumbnail_Mode": field_str(item, "Include_Thumbnail") or None,
        "Studio_Effective_Voiceover_Mode": field_str(item, "Include_Voiceover") or None,
        "Studio_Effective_Carousel_Image_Mode": field_str(item, "Carousel_Image_Mode") or None,
        "Studio_Effective_Background_Music_Mode": field_str(item, "Include_Background_Music") or None,
        "Studio_Effective_Video_Duration_Seconds": field(item, "Content_Duration"),
        "Studio_Effective_Voiceover_Tail_Seconds": voiceover_tail_seconds(item),
        "Voiceover_Tail_Seconds": voiceover_tail_seconds(item),
        "Voiceover_Render_Volume": field_str(item, "Voiceover_Render_Volume") or None,
        "Voiceover_Normalization_Status": field_str(item, "Voiceover_Normalization_Status") or None,
        "Requested_Video_Clip_Count_Mode": clip_mode or None,
        "Requested_Video_Clip_Count_Exact": field(item, "Video_Clip_Count") if clip_mode == "Exact" else None,
        "Requested_Video_Clip_Count_Min": field(item, "Requested_Video_Clip_Count_Min") if clip_mode == "Target range" else None,
        "Requested_Video_Clip_Count_Max": field(item, "Requested_Video_Clip_Count_Max") if clip_mode == "Target range" else None,
        "Requested_Carousel_Slide_Count_Mode": carousel_mode or None,
        "Requested_Carousel_Slide_Count_Exact": field(item, "Carousel_Slide_Count") if carousel_mode == "Exact" else None,
        "Requested_Carousel_Slide_Count_Min": field(item, "Requested_Carousel_Slide_Count_Min") if carousel_mode == "Target range" else None,
        "Requested_Carousel_Slide_Count_Max": field(item, "Requested_Carousel_Slide_Count_Max") if carousel_mode == "Target range" else None,
        "Preferred_Music_Media_Asset_ID": preferred_music_id,
        "Studio_Output_Override_Applied": bool(production_request_id),
        "Thumbnail_URL": field_str(item, "Thumbnail_URL") if include_thumb == "Yes" else "",
        "Voiceover_URL": field_str(item, "Voiceover_URL") if include_vo == "Yes" else "",
        "Output_Notes": (
            f"Mapping notes: {field_str(mapping, 'Output_Template_Notes')}\n"
            f"Source Content ID: {content_id}\n"
            f"Approved target platforms: {platforms_csv}\n"
            f"Normalized production format: {formats_csv}\n"
            f"Approved Content Type: {field_str(item, 'Content_Type')}\n"
            f"Voiceover included: {field_str(item, 'Include_Voiceover') or 'Legacy default'}\n"
            f"Voiceover tail seconds: {voiceover_tail_seconds(item)}\n"
            f"Thumbnail included: {field_str(item, 'Include_Thumbnail') or 'Legacy default'}\n"
            f"Voiceover Google Drive File ID: {field_str(item, 'Voiceover_Google_Drive_File_ID')}\n"
            f"Thumbnail Google Drive File ID: {field_str(item, 'Thumbnail_Google_Drive_File_ID')}\n"
            "Created by P3 v4.5 - Studio Output Work Item Aware. Studio_Target_Platform is "
            "authoritative when present, so each child work item creates only its intended "
            "platform output. Asset_Need_Status starts as Not Needed so R2 gets first "
            "selection opportunity before P4.\n"
            f"Voiceover normalization status: {field_str(item, 'Voiceover_Normalization_Status')}\n"
            f"Voiceover per-output render volume: {field_str(item, 'Voiceover_Render_Volume')}\n"
            f"Requested video clip count mode: {clip_mode}\n"
            f"Studio source authority: {field_str(item, 'Studio_Source_Authority_Status')}. "
            "When Ready, the exact owner-uploaded prepared source set is visually locked. "
            "R2 still runs for canonical validation/music selection but must not replace "
            "or reorder the visuals."
        ),
    }
    if test_run_id:
        fields["Test_Run_ID"] = test_run_id
    if production_request_id:
        fields["Production_Request_Output"] = [production_request_id]
    if ready:
        fields.update(
            {
                "Clip_1_URL": field_str(item, "Studio_Source_Clip_1_URL") or None,
                "Clip_2_URL": field_str(item, "Studio_Source_Clip_2_URL") or None,
                "Clip_3_URL": field_str(item, "Studio_Source_Clip_3_URL") or None,
                "Selected_Clip_1_URL": field_str(item, "Studio_Source_Clip_1_URL") or None,
                "Selected_Clip_2_URL": field_str(item, "Studio_Source_Clip_2_URL") or None,
                "Selected_Clip_3_URL": field_str(item, "Studio_Source_Clip_3_URL") or None,
                "Selected_Clip_1_Media_Asset_ID": field_str(item, "Studio_Source_Clip_1_Media_Asset_ID") or None,
                "Selected_Clip_2_Media_Asset_ID": field_str(item, "Studio_Source_Clip_2_Media_Asset_ID") or None,
                "Selected_Clip_3_Media_Asset_ID": field_str(item, "Studio_Source_Clip_3_Media_Asset_ID") or None,
                "Composition_ID": field_str(item, "Studio_Source_Composition_ID") or None,
                "Selected_Assets_JSON": field_str(item, "Studio_Source_Selected_Assets_JSON") or None,
                "Render_Clip_List_JSON": field_str(item, "Studio_Source_Render_Clip_List_JSON") or None,
                "Render_Total_Frames": total_frames or 0,
                "Selected_Clip_Count": clip_count or 0,
                "Clip_1_Duration_Frames": per_clip,
                "Clip_2_Duration_Frames": per_clip,
                "Clip_3_Duration_Frames": per_clip,
                "Asset_Selection_Notes": (
                    "Studio exact source authority: owner-uploaded platform variants preserved "
                    "in source order; generic R2 visual substitution is forbidden; R2 may only "
                    "complete canonicalization/music selection."
                ),
                "Selected_Asset_Summary": "Studio exact source authority locked before R2.",
            }
        )
    else:
        fields["Asset_Selection_Notes"] = "Generic R2 discovery required."
        fields["Render_Total_Frames"] = 0
        fields["Selected_Clip_Count"] = 0
        fields["Clip_1_Duration_Frames"] = 0
        fields["Clip_2_Duration_Frames"] = 0
        fields["Clip_3_Duration_Frames"] = 0

    return {key: value for key, value in fields.items() if value is not None}
