"""Pure carousel decision helpers — no Airtable I/O."""

from __future__ import annotations

from typing import Any

from render.fields import field, field_str


def image_size_for_ratio(ratio: str) -> str:
    value = str(ratio or "").strip()
    if value == "16:9":
        return "1536x1024"
    if value == "1:1":
        return "1024x1024"
    return "1024x1536"


def ratio_filename_token(ratio: str) -> str:
    return str(ratio or "4:5").replace(":", "x")


def cover_token(is_cover: Any) -> str:
    return "Cover" if bool(is_cover) else "Slide"


def platform_output_mapping(platform: str) -> tuple[str, str]:
    value = str(platform or "").strip()
    if value == "Instagram":
        return "Carousel", "Instagram Carousel"
    if value == "Facebook":
        return "Photo Set", "Facebook Photo Set"
    if value == "TikTok":
        return "Photo Set", "TikTok Photo Set"
    if value == "YouTube":
        return "Vertical Short Video", "YouTube Short"
    return "Carousel", "Instagram Carousel"


def final_gallery_identity_reason(
    slides: list[dict[str, Any]],
    *, min_slides: int = 1, max_slides: int | None = None,
) -> str | None:
    """Reject ambiguous, incomplete or duplicated approved creative sets.

    No selection based on newest timestamp, image URL, approval label or record
    iteration order may determine which of two approved variants to publish.
    C8/C9 must leave the output not-ready until a canonical set is reviewed.
    """
    if len(slides) < min_slides:
        return "insufficient_final_slides"
    if max_slides is not None and len(slides) > max_slides:
        return "too_many_final_slides_for_platform"
    numbers: list[int] = []
    ids: list[str] = []
    for slide in slides:
        number = field(slide, "Slide Number")
        if isinstance(number, bool):
            return "invalid_final_slide_number"
        try:
            numeric = float(number)
            if not numeric.is_integer():
                return "invalid_final_slide_number"
            n = int(numeric)
        except (TypeError, ValueError, OverflowError):
            return "invalid_final_slide_number"
        if n < 1:
            return "invalid_final_slide_number"
        numbers.append(n)
        if slide.get("id"):
            ids.append(str(slide["id"]))
    if len(numbers) != len(set(numbers)) or len(ids) != len(set(ids)):
        return "duplicate_final_slide_number_or_identity"
    if sorted(numbers) != list(range(1, len(numbers) + 1)):
        return "noncontiguous_final_slide_sequence"
    return None


def c2_should_generate(slide: dict[str, Any]) -> bool:
    mode = field_str(slide, "Image Generation Mode").lower()
    prompt = field_str(slide, "AI Prompt")
    if mode != "make ai generated" or not prompt:
        return False
    # A 524/retry must not regenerate slides that already have an image.
    if field_str(slide, "AI Image URL") or field_str(slide, "Current Image URL"):
        return False
    return True


def c5_should_regenerate(slide: dict[str, Any]) -> bool:
    status = field_str(slide, "Review Status").lower()
    requested = bool(field(slide, "Replacement Requested"))
    return requested and status == "rejected - regenerate"


def slide_is_resolved(slide: dict[str, Any]) -> bool:
    if bool(field(slide, "Deleted From Carousel")):
        return True
    approved = bool(field(slide, "Approved For Final"))
    return approved and bool(field_str(slide, "Final Image URL"))


def c7_can_finalize(slides: list[dict[str, Any]]) -> bool:
    if not slides:
        return False
    return all(slide_is_resolved(slide) for slide in slides)


def c8_include_slide(slide: dict[str, Any]) -> bool:
    if bool(field(slide, "Deleted From Carousel")):
        return False
    if field_str(slide, "Review Status").lower() != "final approved":
        return False
    if not bool(field(slide, "Approved For Final")):
        return False
    return bool(field_str(slide, "Final Image URL")) and bool(field_str(slide, "Final Google Drive File ID"))


def c8_group_key(content_item_id: str, platform: str, ratio: str) -> str:
    return f"{content_item_id}|{platform}|{ratio}"


def c3_include_slide(slide: dict[str, Any]) -> bool:
    status = field_str(slide, "Review Status").lower()
    if status not in {"generated", "replacement generated"}:
        return False
    return bool(field_str(slide, "Current Image URL"))


def c3b_action_fields(action: str, *, notes: str = "", timestamp: str = "") -> dict[str, Any] | None:
    key = str(action or "").strip().lower()
    stamp = timestamp or "now"
    common = {
        "Deleted From Carousel": False,
        "Replacement Requested": False,
        "Approved For Final": False,
        "Error Message": "",
    }
    if key == "approve":
        return {
            **common,
            "Review Status": "Approved",
            "Review Notes": f"Approved from C3B button at {stamp}.",
        }
    if key in {"regenerate", "try_ai"}:
        note = (
            f"AI regeneration requested from C3B button at {stamp}."
            if key == "regenerate"
            else f"Try AI version requested from C3B button at {stamp}."
        )
        return {
            **common,
            "Review Status": "Rejected - Regenerate",
            "Image Generation Mode": "Make AI Generated",
            "Replacement Prompt": "",
            "Review Notes": note,
        }
    if key == "delete":
        return {
            **common,
            "Review Status": "Rejected - Delete",
            "Review Notes": f"Delete requested from C3B button at {stamp}.",
        }
    if key == "ai_submit":
        text = notes.strip()
        return {
            **common,
            "Review Status": "Rejected - Regenerate",
            "Image Generation Mode": "Make AI Generated",
            "Replacement Prompt": text,
            "Review Notes": text,
        }
    if key == "manual_replace":
        return {
            **common,
            "Review Status": "Rejected - Manual Replace",
            "Image Generation Mode": "Manual Upload",
            "Replacement Requested": True,
            "Replacement Prompt": "",
            "Review Notes": f"Manual replacement requested from C3B button at {stamp}.",
        }
    if key == "manual_submit":
        text = notes.strip()
        return {
            **common,
            "Review Status": "Rejected - Manual Replace",
            "Image Generation Mode": "Manual Upload",
            "Replacement Requested": True,
            "Replacement Prompt": text,
            "Review Notes": text,
        }
    return None


def c3b_triggers_c4(action: str) -> bool:
    return str(action or "").strip().lower() in {
        "approve",
        "regenerate",
        "delete",
        "try_ai",
        "ai_submit",
        "global_ai_submit",
    }


def c4_route(slide: dict[str, Any]) -> str | None:
    status = field_str(slide, "Review Status").lower()
    if status == "approved" and not bool(field(slide, "Approved For Final")):
        return "approved"
    if status == "rejected - delete" and not bool(field(slide, "Deleted From Carousel")):
        return "delete"
    if status == "rejected - regenerate" and not bool(field(slide, "Replacement Requested")):
        return "regenerate"
    return None
