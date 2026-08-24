from __future__ import annotations

import hashlib
import html
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from carousel.timeutil import iso_utc, utc_now
from config import load_settings
from render.fields import field, field_str
from ttd.constants import (
    DEFAULT_TITLE,
    DESCRIPTION_LIMIT,
    DRAFT_TYPE_VIDEO,
    TITLE_LIMIT,
)


def photo_title(record: dict[str, Any]) -> str:
    return (field_str(record, "Output_Title") or DEFAULT_TITLE)[:TITLE_LIMIT]


def photo_description(record: dict[str, Any]) -> str:
    caption = field_str(record, "Output_Caption")
    hashtags = field_str(record, "Output_Hashtags")
    raw = f"{caption}\n\n{hashtags}".strip() if hashtags else caption
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


def handoff_email_subject(record: dict[str, Any]) -> str:
    output_id = field(record, "Output_ID") or ""
    title = field_str(record, "Output_Title") or "TikTok draft"
    return f"TikTok Draft #{output_id} Ready in Inbox - {title}"


def _ci(value: Any) -> str:
    return str(value or "").strip().casefold()


def image_count_label(record: dict[str, Any]) -> str:
    if _ci(field_str(record, "TikTok_Draft_Type")) == _ci(DRAFT_TYPE_VIDEO):
        return "Video"
    return str(field(record, "Image_Count") or field(record, "Assets_Ready_Count") or "1")


def handoff_email_html(record: dict[str, Any]) -> str:
    output_id = html.escape(str(field(record, "Output_ID") or ""))
    title = html.escape(field_str(record, "Output_Title") or "TikTok draft")
    draft_type = html.escape(field_str(record, "TikTok_Draft_Type") or "")
    caption = html.escape(field_str(record, "Output_Caption"))
    hashtags = html.escape(field_str(record, "Output_Hashtags"))
    assets = html.escape(field_str(record, "TikTok_Draft_Assets_JSON"))
    publish_id = html.escape(field_str(record, "TikTok_Draft_Publish_ID"))
    completion = html.escape(field_str(record, "TikTok_Manual_Completion_URL"))
    when = html.escape(recommended_publish_label(record))
    count = html.escape(image_count_label(record))
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111827;background:#f3f4f6;padding:20px;">'
        '<div style="max-width:820px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;">'
        "<h2 style=\"margin:0 0 8px;\">TikTok draft delivered — manual action required</h2>"
        '<p style="margin:0 0 16px;color:#4b5563;">TikTok accepted the asset package and delivered it to the <b>@chicago.shining</b> inbox. It has not been marked Published in Airtable.</p>'
        f'<div style="border:1px solid #ddd;border-radius:10px;padding:16px;"><h3 style="margin-top:0;">Output #{output_id} — {title}</h3>'
        f"<p><b>Draft type:</b> {draft_type}<br><b>Number of images:</b> {count}<br><b>Recommended publishing time:</b> {when}</p>"
        '<p><b>Caption and hashtags — copyable block:</b></p>'
        f'<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">{caption}\n\n{hashtags}</div>'
        '<p><b>Ordered asset manifest:</b></p>'
        f'<div style="white-space:pre-wrap;word-break:break-word;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">{assets}</div>'
        "<ol><li>Open the TikTok inbox notification from <b>SM Pipeline Social Publisher</b>.</li>"
        "<li>Review and edit the images/video and caption.</li>"
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
