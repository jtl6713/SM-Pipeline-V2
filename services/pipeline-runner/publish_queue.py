"""Live publish-queue formulas from stored platform_outputs columns.

Airtable computed these with NOW(). The stored columns are the inputs.
A due-now flag is calculated when the runner reads, not stored.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict) and value.get("name") is not None:
        return str(value.get("name") or "")
    return str(value)


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _checked(value: Any) -> bool:
    if value is True or value == 1:
        return True
    return str(value).strip().lower() in {"true", "1", "yes"}


def _when(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _due_clock(when: datetime | None, now: datetime) -> bool:
    """True when the retry time is blank or already reached."""
    if when is None:
        return True
    return (now - when).total_seconds() >= 0


def youtube_action_due_now(fields: dict, now: datetime) -> int:
    stage = _text(fields.get("YouTube_Stage") or fields.get("youtube_stage"))
    return int(
        _text(fields.get("Platform") or fields.get("platform")) == "YouTube"
        and _checked(fields.get("Auto_Publish_Enabled") if "Auto_Publish_Enabled" in fields else fields.get("auto_publish_enabled"))
        and not _checked(fields.get("Do_Not_Publish") if "Do_Not_Publish" in fields else fields.get("do_not_publish"))
        and _text(fields.get("Publish_Status") or fields.get("publish_status")) != "Published"
        and stage not in {"Complete", "Terminal Error"}
        and _due_clock(_when(fields.get("Publish_Next_Retry_At") or fields.get("publish_next_retry_at")), now)
    )


def tiktok_draft_action_due_now(fields: dict, now: datetime) -> int:
    status = _text(fields.get("TikTok_Draft_Status") or fields.get("tiktok_draft_status"))
    return int(
        status in {"Processing", "Retry Pending"}
        and _due_clock(_when(fields.get("Publish_Next_Retry_At") or fields.get("publish_next_retry_at")), now)
    )


def fb_resolved_publish_mode(fields: dict) -> str:
    explicit = _text(fields.get("FB_Image_Publish_Mode") or fields.get("fb_image_publish_mode"))
    if explicit in {"Single Photo", "Multi-Photo Collage", "Slideshow Reel"}:
        return explicit
    voice = _text(fields.get("Studio_Effective_Voiceover_Mode") or fields.get("studio_effective_voiceover_mode"))
    music = _text(fields.get("Studio_Effective_Background_Music_Mode") or fields.get("studio_effective_background_music_mode"))
    images = _number(fields.get("Image_Count") if "Image_Count" in fields else fields.get("image_count")) or 0
    if voice == "Yes" or music == "Yes" or images > 1:
        return "Slideshow Reel"
    return "Single Photo"


def fb_action_due_now(fields: dict, now: datetime) -> int:
    mode = _text(fields.get("FB_Resolved_Publish_Mode") or fields.get("fb_resolved_publish_mode")) or fb_resolved_publish_mode(fields)
    retry_eligible = _checked(fields.get("Publish_Retry_Eligible") if "Publish_Retry_Eligible" in fields else fields.get("publish_retry_eligible"))
    retry_at = _when(fields.get("Publish_Next_Retry_At") or fields.get("publish_next_retry_at"))
    return int(
        _text(fields.get("Platform") or fields.get("platform")) == "Facebook"
        and (
            _checked(fields.get("Image_Output_Selected") if "Image_Output_Selected" in fields else fields.get("image_output_selected"))
            or mode == "Slideshow Reel"
        )
        and _checked(fields.get("Auto_Publish_Enabled") if "Auto_Publish_Enabled" in fields else fields.get("auto_publish_enabled"))
        and not _checked(fields.get("Do_Not_Publish") if "Do_Not_Publish" in fields else fields.get("do_not_publish"))
        and _text(fields.get("Publish_Status") or fields.get("publish_status")) != "Published"
        and _text(fields.get("FB_Publish_Status") or fields.get("fb_publish_status")) != "Published"
        and (not retry_eligible or retry_at is None or _due_clock(retry_at, now))
    )


def ig_children_ready(fields: dict) -> int:
    children = _number(fields.get("IG_Carousel_Child_Count") if "IG_Carousel_Child_Count" in fields else fields.get("ig_carousel_child_count"))
    ready = _number(fields.get("IG_Carousel_Children_Ready_Count") if "IG_Carousel_Children_Ready_Count" in fields else fields.get("ig_carousel_children_ready_count"))
    return int(children is not None and children > 0 and ready == children)


def ig_carousel_due_now(fields: dict, now: datetime) -> int:
    if _text(fields.get("IG_Carousel_Status") or fields.get("ig_carousel_status")) == "Published":
        return 0
    if _text(fields.get("Publish_Status") or fields.get("publish_status")) == "Published":
        return 0
    if _text(fields.get("Output_Status") or fields.get("output_status")) == "Published":
        return 0
    retry = _when(fields.get("IG_Carousel_Next_Retry_At") or fields.get("ig_carousel_next_retry_at"))
    if retry is None:
        return 1
    # Airtable treats the stored instant as due, and also due six hours early.
    if retry.astimezone(timezone.utc) <= now.astimezone(timezone.utc):
        return 1
    if retry.astimezone(timezone.utc) - timedelta(hours=6) <= now.astimezone(timezone.utc):
        return 1
    return 0


def assets_need_resolution(fields: dict) -> int:
    images = _number(fields.get("Image_Count") if "Image_Count" in fields else fields.get("image_count"))
    ready = _number(fields.get("Assets_Ready_Count") if "Assets_Ready_Count" in fields else fields.get("assets_ready_count"))
    revision = _text(fields.get("Asset_Set_Revision") or fields.get("asset_set_revision"))
    if images and ready is not None and ready >= images and revision:
        return 0
    return 1


def ttd0_asset_route_ready(fields: dict) -> int:
    draft = _text(fields.get("TikTok_Draft_Type") or fields.get("tiktok_draft_type"))
    aspect = _text(fields.get("Asset_Aspect_Family") or fields.get("asset_aspect_family"))
    images = _number(fields.get("Image_Count") if "Image_Count" in fields else fields.get("image_count")) or 0
    ready = _number(fields.get("TikTok_9x16_Ready_Count") if "TikTok_9x16_Ready_Count" in fields else fields.get("tiktok_9x16_ready_count")) or 0
    asset = _text(fields.get("Publish_Asset_URL") or fields.get("publish_asset_url"))
    photo = draft == "Photo Carousel" and aspect == "9:16" and images > 0 and ready >= images
    video = draft == "Video" and bool(asset)
    return int(photo or video)


_COMPUTES = {
    "YouTube_Action_Due_Now": youtube_action_due_now,
    "TikTok_Draft_Action_Due_Now": tiktok_draft_action_due_now,
    "FB_Action_Due_Now": fb_action_due_now,
    "IG_Carousel_Due_Now": ig_carousel_due_now,
    "IG_Carousel_All_Children_Ready": lambda fields, _now: ig_children_ready(fields),
    "Assets_Need_Resolution": lambda fields, _now: assets_need_resolution(fields),
    "TTD0_Asset_Route_Ready": lambda fields, _now: ttd0_asset_route_ready(fields),
}


def apply_publish_queue_fields(fields: dict, now: datetime | None = None) -> None:
    """Stamp the live formula results onto an Airtable-shaped field bag."""
    clock = now or datetime.now(timezone.utc)
    mode = fb_resolved_publish_mode(fields)
    if mode:
        fields["FB_Resolved_Publish_Mode"] = mode
    for name, fn in _COMPUTES.items():
        fields[name] = fn(fields, clock)


def _quote_time(now: datetime) -> str:
    return quote(now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), safe="")


def due_now_postgrest(field: str, want_due: bool, now: datetime | None = None) -> str | None:
    """PostgREST filter for `{Formula}=1` or `{Formula}=0`."""
    clock = _quote_time(now or datetime.now(timezone.utc))
    retry = f"or(publish_next_retry_at.is.null,publish_next_retry_at.lte.{clock})"
    filters = {
        "YouTube_Action_Due_Now": (
            "and(platform.eq.YouTube,auto_publish_enabled.is.true,do_not_publish.is.false,"
            "publish_status.neq.Published,or(youtube_stage.is.null,and(youtube_stage.neq.Complete,youtube_stage.neq.\"Terminal Error\")),"
            f"{retry})"
        ),
        "TikTok_Draft_Action_Due_Now": (
            "and(or(tiktok_draft_status.eq.Processing,tiktok_draft_status.eq.\"Retry Pending\"),"
            f"{retry})"
        ),
        "FB_Action_Due_Now": (
            "and(platform.eq.Facebook,or(image_output_selected.is.true,fb_resolved_publish_mode.eq.\"Slideshow Reel\"),"
            "auto_publish_enabled.is.true,do_not_publish.is.false,publish_status.neq.Published,"
            "fb_publish_status.neq.Published,"
            f"or(publish_retry_eligible.is.false,publish_retry_eligible.is.null,publish_next_retry_at.is.null,publish_next_retry_at.lte.{clock}))"
        ),
        "IG_Carousel_Due_Now": (
            "and(ig_carousel_status.neq.Published,publish_status.neq.Published,output_status.neq.Published,"
            f"or(ig_carousel_next_retry_at.is.null,ig_carousel_next_retry_at.lte.{_quote_time((now or datetime.now(timezone.utc)) + timedelta(hours=6))}))"
        ),
        # Child-ready, asset-resolution, and the TikTok 9:16 route compare two
        # columns. PostgREST cannot express that, so those lists stay on Airtable.
        "IG_Carousel_All_Children_Ready": None,
        "Assets_Need_Resolution": None,
        "TTD0_Asset_Route_Ready": None,
    }
    expr = filters.get(field)
    if not expr:
        return None
    if want_due:
        return expr
    return f"not.{expr}" if not expr.startswith("not.") else expr[4:]
