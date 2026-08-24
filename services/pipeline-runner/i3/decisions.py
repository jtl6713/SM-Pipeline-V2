"""I3 Airtable field patches — Make 5517182 modules 3/4/5/7/10/14."""

from __future__ import annotations

from typing import Any

from carousel.timeutil import iso_ms
from idea.mapping import (
    default_slide_count,
    first_value,
    media_choice,
    normalize_content_type,
    split_platforms,
    video_clip_count,
    video_duration_seconds,
    voiceover_tail,
)


def _clear_terminal_stamps(now: str) -> dict[str, Any]:
    return {
        "Deleted_At": None,
        "Rejected_At": None,
        "Approved_At": now,
        "Candidate_Status": "Approved",
    }


def carousel_fields(payload: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    stamp = now or iso_ms()
    platforms = first_value(payload, "production_platforms") or "Instagram"
    mode = first_value(payload, "carousel_image_mode")
    slides = default_slide_count(payload)
    notes = (
        "Approved via I2/I3 carousel configuration form. "
        f"Content type=Carousel; platforms={platforms}; image mode={mode}; slide count={slides}; "
        f"include_voiceover={media_choice(first_value(payload, 'include_voiceover'))}; "
        f"include_background_music={media_choice(first_value(payload, 'include_background_music'))}; "
        f"include_thumbnail={media_choice(first_value(payload, 'include_thumbnail'))}; "
        f"notes={first_value(payload, 'production_config_notes')}; received={stamp}"
    )
    return {
        **_clear_terminal_stamps(stamp),
        "Voiceover_Tail_Seconds": 2,
        "Production_Config_Notes": notes,
        "Production_Content_Type": "Carousel",
        "Production_Target_Platforms": split_platforms(platforms),
        "Production_Include_Voiceover": media_choice(first_value(payload, "include_voiceover")),
        "Production_Include_Background_Music": media_choice(first_value(payload, "include_background_music")),
        "Production_Include_Thumbnail": media_choice(first_value(payload, "include_thumbnail")),
        "Production_Carousel_Image_Mode": mode,
        "Production_Carousel_Slide_Count": slides,
    }


def video_fields(payload: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    stamp = now or iso_ms()
    platforms = first_value(payload, "production_platforms") or "Instagram"
    content_type = normalize_content_type(
        first_value(payload, "production_content_type") or "Vertical Short Video",
        platforms,
    )
    duration = video_duration_seconds(payload)
    clips = video_clip_count(payload)
    tail = voiceover_tail(payload)
    notes = (
        "Approved via I2/I3 video configuration form. "
        f"Content type={content_type}; platforms={first_value(payload, 'platform_label') or platforms}; "
        f"video asset mode={first_value(payload, 'video_asset_mode') or 'Make/Render'}; "
        f"duration={duration} seconds; clip count={clips if clips is not None else 'Auto'}; "
        f"include_voiceover={media_choice(first_value(payload, 'include_voiceover'))}; "
        f"voiceover_tail_seconds={tail}; received={stamp}"
    )
    fields: dict[str, Any] = {
        **_clear_terminal_stamps(stamp),
        "Voiceover_Tail_Seconds": tail,
        "Production_Config_Notes": notes,
        "Production_Content_Type": content_type,
        "Production_Video_Duration": duration,
        "Production_Target_Platforms": split_platforms(platforms),
        "Production_Include_Voiceover": media_choice(first_value(payload, "include_voiceover")),
        "Production_Include_Background_Music": media_choice(first_value(payload, "include_background_music")),
        "Production_Include_Thumbnail": media_choice(first_value(payload, "include_thumbnail")),
        "Production_Carousel_Image_Mode": None,
        "Production_Carousel_Slide_Count": None,
    }
    if clips is not None:
        fields["Production_Video_Clip_Count"] = clips
    else:
        fields["Production_Video_Clip_Count"] = None
    return fields


def config_approve_fields(payload: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    stamp = now or iso_ms()
    platforms = first_value(payload, "production_platforms") or "Instagram,Facebook,TikTok,YouTube"
    content_type = normalize_content_type(first_value(payload, "production_content_type"), platforms)
    tail = voiceover_tail(payload)
    notes = (
        "Approved via I2 production config button. "
        f"Content type={content_type}; platforms={platforms}; "
        f"image mode={first_value(payload, 'carousel_image_mode')}; "
        f"slide count={first_value(payload, 'carousel_slide_count')}; received={stamp}"
    )
    fields: dict[str, Any] = {
        **_clear_terminal_stamps(stamp),
        "Voiceover_Tail_Seconds": tail,
        "Production_Config_Notes": notes,
        "Production_Content_Type": content_type,
        "Production_Target_Platforms": split_platforms(platforms),
        "Production_Include_Voiceover": media_choice(first_value(payload, "include_voiceover")),
        "Production_Include_Background_Music": media_choice(first_value(payload, "include_background_music")),
        "Production_Include_Thumbnail": media_choice(first_value(payload, "include_thumbnail")),
    }
    if content_type == "Carousel":
        fields["Production_Carousel_Image_Mode"] = first_value(payload, "carousel_image_mode")
        fields["Production_Carousel_Slide_Count"] = default_slide_count(payload)
    return fields


def quick_approve_fields(*, now: str | None = None) -> dict[str, Any]:
    stamp = now or iso_ms()
    return {**_clear_terminal_stamps(stamp), "Voiceover_Tail_Seconds": 2}


def tune_fields() -> dict[str, Any]:
    return {
        "Candidate_Status": "Tune Requested",
        "Approved_At": None,
        "Rejected_At": None,
        "Deleted_At": None,
    }


def reject_fields(*, now: str | None = None) -> dict[str, Any]:
    return {
        "Candidate_Status": "Rejected",
        "Rejected_At": now or iso_ms(),
        "Approved_At": None,
        "Deleted_At": None,
    }
