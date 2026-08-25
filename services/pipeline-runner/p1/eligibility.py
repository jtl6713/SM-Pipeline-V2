from __future__ import annotations

from typing import Any

from render.fields import field, field_str, first_linked_id


def _has_text(record: dict[str, Any], name: str) -> bool:
    return bool(field_str(record, name))


def initial_eligibility_reason(item: dict[str, Any]) -> str | None:
    if not item.get("id"):
        return "missing_item"
    if not first_linked_id(field(item, "Content_Profile")):
        return "missing_profile"
    if not _has_text(item, "Content_Title"):
        return "missing_title"
    if not _has_text(item, "Idea_Summary"):
        return "missing_summary"
    if _has_text(item, "Script"):
        return "already_has_script"
    if _has_text(item, "Caption"):
        return "already_has_caption"
    return None


def recheck_formula(record_id: str) -> str:
    return (
        "AND("
        f"RECORD_ID()='{record_id}',"
        'OR({Content_Status}="Idea Approved",{Content_Status}="Ready for Script"),'
        "{Content_Profile}!=BLANK(),"
        "{Content_Title}!=BLANK(),"
        "{Idea_Summary}!=BLANK(),"
        "NOT({Do_Not_Produce}),"
        "{Script}=BLANK(),"
        "{Caption}=BLANK(),"
        'OR({Script_Status}=BLANK(),{Script_Status}="Not Started",{Script_Status}="Ready")'
        ")"
    )


def require_active(record: dict[str, Any] | None, name_field: str) -> str | None:
    if not record or not record.get("id"):
        return "missing_record"
    if field(record, "Active") is not True:
        return "inactive"
    if not field_str(record, name_field):
        return "missing_name"
    return None


def yes_no(value: Any, default_bool: bool | None = None) -> str:
    text = str(value or "").strip()
    if text:
        return text
    if default_bool is True:
        return "Yes"
    if default_bool is False:
        return "No"
    return ""


def effective_options(item: dict[str, Any], production: dict[str, Any]) -> dict[str, Any]:
    duration = field(item, "Content_Duration")
    if duration in (None, ""):
        duration = field(production, "Default_Duration")
    clip_count = field(item, "Video_Clip_Count")
    if clip_count in (None, ""):
        clip_count = field(production, "Default_Video_Clip_Count")
    slide_count = field(item, "Carousel_Slide_Count")
    if slide_count in (None, ""):
        slide_count = field(production, "Default_Carousel_Slide_Count")
    include_vo = yes_no(field(item, "Include_Voiceover"), bool(field(production, "Include_Voiceover")))
    include_music = yes_no(
        field(item, "Include_Background_Music"),
        bool(field(production, "Include_Background_Music")),
    )
    include_thumb = yes_no(field(item, "Include_Thumbnail"), bool(field(production, "Include_Thumbnail")))
    tail = 0
    target_vo = 0
    if include_vo == "Yes":
        tail_raw = field(item, "Voiceover_Tail_Seconds")
        tail = int(tail_raw) if tail_raw not in (None, "") else 2
        try:
            duration_n = float(duration or 0)
        except (TypeError, ValueError):
            duration_n = 0
        target_vo = duration_n - tail
        if target_vo <= 1:
            target_vo = 1
    return {
        "duration": duration,
        "clip_count": clip_count,
        "slide_count": slide_count,
        "carousel_mode": field_str(item, "Carousel_Image_Mode") or field_str(production, "Default_Carousel_Image_Mode"),
        "include_voiceover": include_vo,
        "include_music": include_music,
        "include_thumbnail": include_thumb,
        "voiceover_tail_seconds": tail,
        "target_voiceover_duration": target_vo,
        "aspect_ratio": field_str(production, "Aspect_Ratio"),
    }


def content_status_for(options: dict[str, Any]) -> str:
    if options["include_voiceover"] == "Yes":
        return "Ready for Voiceover"
    if options["include_thumbnail"] == "Yes":
        return "Ready for Thumbnail"
    return "Script Generated"


def pick_forced(mode: str, requested: str, generated: str) -> str:
    if mode == "Force exact" and requested.strip():
        return requested.strip()
    return generated.strip()
