from __future__ import annotations

from typing import Any

from render.fields import field, field_str


def eligibility_reason(slide: dict[str, Any] | None) -> str | None:
    if not slide:
        return "missing_slide"
    if field_str(slide, "Slide_Voiceover_Status") != "Ready":
        return "status_not_ready"
    deleted = field(slide, "Deleted From Carousel")
    if deleted in (True, 1, "1"):
        return "deleted"
    if not field_str(slide, "Slide_Voiceover_Text"):
        return "missing_text"
    if not field_str(slide, "Slide_Voice_ID"):
        return "missing_voice_id"
    if not field_str(slide, "Studio_Voice_Prep_Request_ID"):
        return "missing_request_token"
    if field_str(slide, "Slide_Voiceover_URL"):
        return "already_has_url"
    return None
