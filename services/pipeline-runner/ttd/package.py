from __future__ import annotations

import hashlib
import html
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from ap0.public_cover import graph_fetchable_cover_url
from carousel.timeutil import iso_utc, utc_now
from config import load_settings
from publish.location import PublishLocation, append_location_line
from render.fields import field, field_str, first_linked_id, parse_json_field
from rr1.email_builder import thumbnail_download_url
from ttd.constants import (
    DEFAULT_TITLE,
    DESCRIPTION_LIMIT,
    DRAFT_TYPE_VIDEO,
    TITLE_LIMIT,
)


def photo_title(record: dict[str, Any]) -> str:
    return (field_str(record, "Output_Title") or DEFAULT_TITLE)[:TITLE_LIMIT]


def photo_description(
    record: dict[str, Any],
    *,
    location: PublishLocation | None = None,
) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    raw = f"{caption}\n\n{hashtags}".strip() if hashtags else caption
    # TikTok Content Posting API has no place/POI field; keep location in caption text.
    raw = append_location_line(raw, location)
    return raw[:DESCRIPTION_LIMIT]


def completion_token_material(record_id: str, publish_id: str, *, now: datetime | None = None) -> str:
    stamp = (now or utc_now()).astimezone(timezone.utc).strftime("%Y%m%d%H%M%S%f")[:-3]
    return f"TTD2:{record_id}:{publish_id}:{stamp}"


def hash_completion_token(material: str) -> str:
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def completion_url(base: str, record_id: str, token: str) -> str:
    target = str(base or "").strip()
    if not target:
        public = str(load_settings().get("public_base_url") or "").rstrip("/")
        target = f"{public}/hooks/ttd4" if public else ""
    if not target:
        return ""
    query = urlencode({"record_id": record_id, "token": token, "action": "form"})
    separator = "&" if "?" in target else "?"
    return f"{target}{separator}{query}"


def recommended_publish_label(record: dict[str, Any]) -> str:
    raw = field(record, "Recommended_Publication_At") or field(record, "Scheduled_Post_Date")
    if not raw:
        return "Publish when ready"
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return "Publish when ready"
    local = parsed.astimezone()
    return local.strftime("%b %d, %Y %I:%M %p").replace(" 0", " ")


def chicago_publish_label(raw: Any) -> str:
    if not raw:
        return ""
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return ""
    try:
        from zoneinfo import ZoneInfo

        local = parsed.astimezone(ZoneInfo("America/Chicago"))
        stamp = local.strftime("%a %b %d, %I:%M %p CT").replace(" 0", " ")
        return stamp
    except Exception:
        return recommended_publish_label({"fields": {"Scheduled_Post_Date": raw}})


def is_az_finished_video(record: dict[str, Any]) -> bool:
    notes = "\n".join(
        field_str(record, name)
        for name in ("Output_Notes", "Production_Notes", "Internal_Notes")
    ).casefold()
    return "origin=az-finished-video" in notes or (
        "az-auto-queue=1" in notes and "ez-input=finished-video" in notes
    )


def sibling_platform_outputs(client: Any, record: dict[str, Any]) -> list[dict[str, Any]]:
    content_id = first_linked_id(field(record, "Content_Item"))
    if not content_id or client is None:
        return []
    from airtable.constants import PLATFORM_OUTPUTS_TABLE

    formula = (
        f'AND({{Test_Run_ID}}=BLANK(),FIND("{content_id}", ARRAYJOIN({{Content_Item}})))'
    )
    rows = client.list_records(PLATFORM_OUTPUTS_TABLE, formula=formula, max_records=20)
    current = str(record.get("id") or "")
    return [row for row in rows if str(row.get("id") or "") != current]


def _output_surface(record: dict[str, Any]) -> str:
    platform = field_str(record, "Platform") or "Platform"
    kind = field_str(record, "Studio_Output_Type") or field_str(record, "Format") or field_str(record, "Platform_Output_Type")
    return f"{platform} {kind}".strip()


def sibling_status_line(record: dict[str, Any]) -> str:
    label = html.escape(_output_surface(record))
    permalink = field_str(record, "Platform_Post_URL")
    publish = field_str(record, "Publish_Status")
    if permalink and publish.casefold() in {"published", "published privately"}:
        safe = html.escape(permalink, quote=True)
        return f"<li><b>{label}:</b> live — <a href=\"{safe}\">{html.escape(permalink)}</a></li>"
    when = chicago_publish_label(field(record, "Scheduled_Post_Date") or field(record, "Recommended_Publication_At"))
    if when:
        return f"<li><b>{label}:</b> scheduled {html.escape(when)}</li>"
    status = html.escape(publish or field_str(record, "Output_Status") or "in production")
    return f"<li><b>{label}:</b> {status}</li>"


def platform_status_block(siblings: list[dict[str, Any]] | None) -> str:
    rows = [sibling_status_line(row) for row in (siblings or [])]
    if not rows:
        return (
            "<p><b>Other platforms:</b> Instagram, Facebook, and YouTube are on the same campaign day. "
            "Check Pipeline if a permalink is not listed yet.</p>"
        )
    return (
        '<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">'
        "<p style=\"margin:0 0 8px 0;\"><b>Same-piece status</b></p>"
        f"<ul style=\"margin:0;padding-left:18px;\">{''.join(rows)}</ul></div>"
    )


def _lookup_display_text(value: Any) -> str:
    """Best-effort display text for Airtable lookup/link values, never a rec... id."""
    if isinstance(value, str):
        text = value.strip()
        return "" if text.startswith("rec") else text
    if isinstance(value, list):
        for item in value:
            text = _lookup_display_text(item)
            if text:
                return text
        return ""
    if isinstance(value, dict):
        name = str(value.get("name") or "").strip()
        if name:
            return name
        values = value.get("valuesByLinkedRecordId")
        if isinstance(values, dict):
            for linked_values in values.values():
                text = _lookup_display_text(linked_values)
                if text:
                    return text
    return ""


def profile_display_name(record: dict[str, Any], profile: dict[str, Any] | None = None) -> str:
    """Exact Content Profile name for human-facing TikTok handoffs."""
    if profile:
        for field_name in ("Profile_Name", "Brand_Name", "Market_Name"):
            value = field_str(profile, field_name)
            if value:
                return value

    lookup_name = _lookup_display_text(field(record, "Content_Profile"))
    if lookup_name:
        return lookup_name
    for field_name in ("Profile_Name", "Brand_Name", "Market_Name"):
        value = _lookup_display_text(field(record, field_name))
        if value:
            return value
    return "ChicagoShining"


def profile_tiktok_handle(profile: dict[str, Any] | None = None) -> str:
    handle = field_str(profile or {}, "TikTok_Handle")
    if not handle:
        return ""
    return handle if handle.startswith("@") else f"@{handle}"


def handoff_email_subject(
    record: dict[str, Any],
    *,
    profile: dict[str, Any] | None = None,
) -> str:
    title = field_str(record, "Output_Title") or "TikTok draft"
    profile_name = profile_display_name(record, profile)
    if is_az_finished_video(record):
        return f"{profile_name} publish package — {title}"
    output_id = field(record, "Output_ID") or ""
    return f"TikTok Draft #{output_id} — {profile_name} — Ready in Inbox - {title}"


def _ordered_asset_urls(record: dict[str, Any]) -> list[str]:
    parsed = parse_json_field(field(record, "TikTok_Draft_Assets_JSON"))
    if isinstance(parsed, list):
        return [str(value).strip() for value in parsed if str(value or "").strip()]
    if isinstance(parsed, dict):
        source = str(parsed.get("source_url") or "").strip()
        return [source] if source else []
    return []


def _slide_label(slide: dict[str, Any], index: int) -> str:
    name = field_str(slide, "Slide Name")
    if name:
        return name
    number = field(slide, "Slide Number") or field(slide, "Current Order")
    if number not in (None, ""):
        return f"Slide {number}"
    return f"Image {index + 1}"


def ordered_asset_links_html(
    record: dict[str, Any],
    *,
    slides: list[dict[str, Any]] | None = None,
) -> str:
    """Render the stored manifest as short named links without exposing raw JSON."""
    urls = _ordered_asset_urls(record)
    if not urls:
        return (
            '<div style="margin:8px 0;padding:12px;border:1px solid #e5e7eb;'
            'border-radius:8px;background:#f9fafb;color:#6b7280;">No draft asset links were stored.</div>'
        )

    by_url: dict[str, str] = {}
    for index, slide in enumerate(slides or []):
        url = field_str(slide, "Asset_9x16_Public_URL")
        if url and url not in by_url:
            by_url[url] = _slide_label(slide, index)

    is_video = _ci(field_str(record, "TikTok_Draft_Type")) == _ci(DRAFT_TYPE_VIDEO)
    rows: list[str] = []
    for index, url in enumerate(urls):
        label = by_url.get(url) or ("Video draft asset" if is_video else f"Image {index + 1}")
        safe_url = html.escape(url, quote=True)
        safe_label = html.escape(label)
        rows.append(
            '<li style="margin:0 0 8px 0;">'
            f'<a href="{safe_url}" style="font-weight:700;color:#2563eb;text-decoration:none;">{safe_label}</a>'
            "</li>"
        )
    return (
        '<div style="margin:8px 0;padding:12px 14px;border:1px solid #e5e7eb;'
        'border-radius:8px;background:#f9fafb;">'
        f'<ol style="margin:0;padding-left:22px;">{"".join(rows)}</ol></div>'
    )


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def image_count_label(record: dict[str, Any]) -> str:
    if _ci(field_str(record, "TikTok_Draft_Type")) == _ci(DRAFT_TYPE_VIDEO):
        return "Video"
    return str(field(record, "Image_Count") or field(record, "Assets_Ready_Count") or "1")


def cover_block(record: dict[str, Any]) -> str:
    raw = field_str(record, "Thumbnail_URL")
    public = graph_fetchable_cover_url(raw)
    download = public or thumbnail_download_url(raw)
    if not download:
        return (
            '<p style="margin:10px 0;color:#6b7280;"><b>3D grid cover:</b> '
            "Not set on this output. Generate the thumbnail before posting so you can set the cover in TikTok.</p>"
        )
    safe_src = html.escape(download, quote=True)
    safe_text = html.escape(download)
    return (
        '<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">'
        '<p style="margin:0 0 8px 0;"><b>3D grid cover</b> — TikTok’s draft API cannot attach this. '
        "Download the still and set it as the cover in the TikTok app.</p>"
        f'<p style="margin:0 0 10px 0;"><img src="{safe_src}" alt="TikTok 3D grid cover" '
        'style="max-width:280px;width:100%;height:auto;border-radius:6px;border:1px solid #d1d5db;display:block;"></p>'
        f'<p style="margin:0 0 6px 0;"><a href="{safe_src}">Download cover image</a></p>'
        f'<p style="margin:0;font-size:12px;color:#4b5563;word-break:break-all;"><b>Direct link:</b> {safe_text}</p>'
        "</div>"
    )


def handoff_email_html(
    record: dict[str, Any],
    *,
    location: PublishLocation | None = None,
    siblings: list[dict[str, Any]] | None = None,
    profile: dict[str, Any] | None = None,
    asset_slides: list[dict[str, Any]] | None = None,
) -> str:
    output_id = html.escape(str(field(record, "Output_ID") or ""))
    title = html.escape(field_str(record, "Output_Title") or "TikTok draft")
    draft_type = html.escape(field_str(record, "TikTok_Draft_Type") or "")
    caption = html.escape(field_str(record, "Output_Caption"))
    hashtags = html.escape(field_str(record, "Output_Hashtags"))
    location_label = html.escape(location.label if location else "")
    location_block = (
        f"<p><b>Suggested TikTok location (tag manually in app):</b> {location_label}</p>"
        if location_label
        else ""
    )
    assets = ordered_asset_links_html(record, slides=asset_slides)
    publish_id = html.escape(field_str(record, "TikTok_Draft_Publish_ID"))
    completion = html.escape(field_str(record, "TikTok_Manual_Completion_URL"))
    when = html.escape(recommended_publish_label(record))
    count = html.escape(image_count_label(record))
    az = is_az_finished_video(record)
    profile_name = html.escape(profile_display_name(record, profile))
    tiktok_handle = html.escape(profile_tiktok_handle(profile))
    destination = tiktok_handle or profile_name
    profile_banner = f"<b>Profile:</b> {profile_name}"
    if tiktok_handle:
        profile_banner += f"<br><b>TikTok:</b> {tiktok_handle}"
    heading = f"{profile_name} publish package" if az else "TikTok draft delivered — manual action required"
    intro = (
        f'<p style="margin:0 0 16px;color:#4b5563;">TikTok accepted the asset package and delivered it to the TikTok inbox for <b>{destination}</b>. '
        "Sibling Instagram, Facebook, and YouTube posts for this video share the same campaign day. "
        "TikTok cannot tell us when the inbox draft goes public — use Mark as Published after you post. "
        "TikTok Story is still manual in the app.</p>"
        if az
        else f'<p style="margin:0 0 16px;color:#4b5563;">TikTok accepted the asset package and delivered it to the TikTok inbox for <b>{destination}</b>. It has not been marked Published in Airtable.</p>'
    )
    status_block = platform_status_block(siblings) if az else ""
    story_note = (
        '<p style="margin:12px 0;padding:10px;border:1px solid #fde68a;border-radius:8px;background:#fffbeb;">'
        "<b>TikTok Story:</b> the Content Posting API has no Stories destination. Post that Story in the TikTok app after the draft is live.</p>"
        if az
        else ""
    )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111827;background:#f3f4f6;padding:20px;">'
        '<div style="max-width:820px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;">'
        f"<h2 style=\"margin:0 0 8px;\">{heading}</h2>"
        f'<div style="margin:0 0 14px;padding:10px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;">{profile_banner}</div>'
        f"{intro}"
        f"{status_block}"
        f'<div style="border:1px solid #ddd;border-radius:10px;padding:16px;"><h3 style="margin-top:0;">Output #{output_id} — {title}</h3>'
        f"<p><b>Draft type:</b> {draft_type}<br><b>Number of images:</b> {count}<br><b>Recommended publishing time:</b> {when}</p>"
        f"{location_block}"
        f"{cover_block(record)}"
        '<p><b>Caption and hashtags — copyable block:</b></p>'
        f'<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">{caption}\n\n{hashtags}</div>'
        '<p><b>Ordered draft assets:</b></p>'
        f"{assets}"
        f"{story_note}"
        "<ol><li>Open the TikTok inbox notification from <b>SM Pipeline Social Publisher</b>.</li>"
        "<li>Review and edit the images/video and caption.</li>"
        "<li>Download the 3D cover above and set it as the draft cover in TikTok.</li>"
        "<li>Add the suggested location tag in TikTok when available.</li>"
        "<li>Add music in TikTok before posting when music is requested.</li>"
        "<li>Post manually.</li>"
        "<li>Use the button below to record the final TikTok URL.</li></ol>"
        f'<p><a href="{completion}" style="display:inline-block;padding:11px 16px;background:#111827;color:#fff;text-decoration:none;border-radius:7px;font-weight:bold;">Mark as Published</a></p>'
        f'<p style="font-size:12px;color:#6b7280;">Draft publish ID: {publish_id}</p></div></div></div>'
    )


def form_html(record: dict[str, Any], *, action_url: str) -> str:
    output_id = html.escape(str(field(record, "Output_ID") or ""))
    title = html.escape(field_str(record, "Output_Title") or "")
    record_id = html.escape(str(record.get("id") or ""))
    token = html.escape(field_str(record, "TikTok_Manual_Completion_Token"))
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Complete TikTok Publishing</title>"
        "<style>body{font-family:Arial,sans-serif;background:#f3f4f6;color:#111827;margin:0;padding:32px 18px}"
        ".card{max-width:700px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px}"
        "label{display:block;font-weight:700;margin:16px 0 6px}input[type=url],select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:7px}"
        "button{margin-top:20px;background:#111827;color:white;border:0;border-radius:7px;padding:12px 18px;font-weight:700}.muted{color:#6b7280}</style></head>"
        f"<body><div class=\"card\"><h1>Mark TikTok output as published</h1><p><b>Output #{output_id}</b> — {title}</p>"
        "<p class=\"muted\">Use this only after completing the post in the TikTok app.</p>"
        f"<form method=\"post\" action=\"{html.escape(action_url)}\">"
        f"<input type=\"hidden\" name=\"record_id\" value=\"{record_id}\">"
        f"<input type=\"hidden\" name=\"token\" value=\"{token}\">"
        "<input type=\"hidden\" name=\"action\" value=\"submit\">"
        "<label for=\"platform_post_url\">Final TikTok post URL</label>"
        "<input id=\"platform_post_url\" name=\"platform_post_url\" type=\"url\" required placeholder=\"https://www.tiktok.com/@chicago.shining/video/...\">"
        "<label for=\"music_completed\">Music handling</label>"
        "<select id=\"music_completed\" name=\"music_completed\">"
        "<option value=\"not_requested\">No music requested / not applicable</option>"
        "<option value=\"yes\">Music selected or completed in TikTok</option>"
        "<option value=\"no\">Published without completing the requested music step</option>"
        "</select><button type=\"submit\">Confirm Published</button></form></div></body></html>"
    )


def page_html(*, title: str, body: str, extra: str = "") -> str:
    return (
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<title>{html.escape(title)}</title>"
        "<style>body{font-family:Arial,sans-serif;max-width:720px;margin:60px auto;padding:0 20px}.ok{color:#067647}</style></head>"
        f"<body><h1>{html.escape(title)}</h1><p>{body}</p>{extra}</body></html>"
    )


def submit_action_url(form_url: str) -> str:
    return str(form_url or "").replace("action=form", "action=submit")


def now_iso() -> str:
    return iso_utc()
