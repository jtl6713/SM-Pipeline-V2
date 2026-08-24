"""I2 review email — Make 5516968 module 2/3 HTML."""

from __future__ import annotations

import html
from typing import Any
from urllib.parse import quote

from idea.constants import I2_BACKUP_VIEW_URL
from render.fields import field, field_str


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _join(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value if item)
    return str(value or "")


def _button(url: str, label: str, color: str) -> str:
    return (
        f'<a href="{_esc(url)}" title="{_esc(label)}" style="display:inline-block;padding:9px 12px;'
        f'color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:7px;'
        f'margin-bottom:8px;font-size:13px;background:{color};">{_esc(label)}</a>'
    )


def review_action_url(base_url: str, **params: str) -> str:
    base = (base_url or "").rstrip("/")
    query = [f"{quote(key)}={quote(str(value))}" for key, value in params.items() if value]
    return f"{base}?{'&'.join(query)}"


def candidate_card(record: dict[str, Any], *, review_url: str) -> str:
    record_id = record["id"]
    return (
        '<div style="border:1px solid #ddd;border-radius:10px;padding:16px;margin:0 0 18px 0;background:#ffffff;">'
        f'<h3 style="margin:0 0 8px 0;color:#111827;">{_esc(field_str(record, "Candidate_Title"))}</h3>'
        f'<p style="margin:6px 0;"><b>Summary:</b> {_esc(field_str(record, "Idea_Summary"))}</p>'
        f'<p style="margin:6px 0;"><b>Hook:</b> {_esc(field_str(record, "Hook"))}</p>'
        f'<p style="margin:6px 0;"><b>Suggested Format:</b> {_esc(_join(field(record, "Suggested_Format")))}'
        f' &nbsp; | &nbsp; <b>Suggested Platforms:</b> {_esc(_join(field(record, "Suggested_Platforms")))}</p>'
        f'<p style="margin:6px 0;"><b>Location:</b> {_esc(field_str(record, "Primary_Location"))}'
        f' / {_esc(field_str(record, "Neighborhood_or_Area"))}</p>'
        f'<p style="margin:6px 0;"><b>Suggested Visuals:</b> {_esc(field_str(record, "Suggested_Visuals"))}</p>'
        f'<p style="margin:6px 0;"><b>Required Assets:</b> {_esc(field_str(record, "Required_Assets"))}</p>'
        f'<p style="margin:6px 0;"><b>Priority:</b> {_esc(field(record, "Priority_Score"))}'
        f' &nbsp; | &nbsp; <b>Duplicate Risk:</b> {_esc(field_str(record, "Duplicate_Risk"))}</p>'
        f'<p style="margin:6px 0;"><b>Why it should work:</b> {_esc(field_str(record, "Why_This_Should_Work"))}</p>'
        f'<p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;"><b>Decision Token:</b> {_esc(field_str(record, "Decision_Token"))}</p>'
        '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Quick Approve / Use Airtable Config</p>'
        + _button(review_action_url(review_url, record_id=record_id, decision="approved"), "Approve / Use Airtable Config", "#15803d")
        + "</div>"
        '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Carousel Options</p>'
        + _button(review_action_url(review_url, record_id=record_id, action="carousel_form", production_platforms="Instagram", carousel_image_mode="Manual Upload"), "Carousel Manual - IG", "#0369a1")
        + _button(review_action_url(review_url, record_id=record_id, action="carousel_form", production_platforms="All", carousel_image_mode="Manual Upload"), "Carousel Manual - All", "#0369a1")
        + _button(review_action_url(review_url, record_id=record_id, action="carousel_form", production_platforms="Instagram", carousel_image_mode="Make AI Generated"), "Carousel Make - IG", "#7c3aed")
        + _button(review_action_url(review_url, record_id=record_id, action="carousel_form", production_platforms="All", carousel_image_mode="Make AI Generated"), "Carousel Make - All", "#7c3aed")
        + "</div>"
        '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Video Options</p>'
        + _button(review_action_url(review_url, record_id=record_id, action="video_form", production_content_type="Vertical Short Video", production_platforms="Instagram", platform_label="Instagram", video_asset_mode="Make/Render"), "Video Reel - IG", "#be185d")
        + _button(review_action_url(review_url, record_id=record_id, action="video_form", production_content_type="Vertical Short Video", production_platforms="All", platform_label="All", video_asset_mode="Make/Render"), "Video Reel - All", "#be185d")
        + _button(review_action_url(review_url, record_id=record_id, action="video_form", production_content_type="Vertical Short Video", production_platforms="YouTube", platform_label="YouTube Shorts", video_asset_mode="Make/Render"), "Video Short - YouTube Shorts", "#dc2626")
        + _button(review_action_url(review_url, record_id=record_id, action="video_form", production_content_type="Vertical Short Video", production_platforms="All", platform_label="All", video_asset_mode="Manual Assets"), "Video Manual Assets", "#0f766e")
        + _button(review_action_url(review_url, record_id=record_id, action="video_form", production_content_type="Vertical Short Video", production_platforms="All", platform_label="All", video_asset_mode="Make/Render"), "Video Make/Render", "#4338ca")
        + "</div>"
        '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 8px 0;font-weight:bold;color:#111827;">Post / Story Options</p>'
        + _button(review_action_url(review_url, record_id=record_id, decision="approved", production_content_type="Feed Post", production_platforms="Instagram,Facebook", include_voiceover="No", include_background_music="No", include_thumbnail="Yes"), "Feed Post - IG/FB", "#2563eb")
        + _button(review_action_url(review_url, record_id=record_id, decision="approved", production_content_type="Story", production_platforms="Instagram,Facebook", include_voiceover="No", include_background_music="No", include_thumbnail="Yes"), "Story - IG/FB", "#0891b2")
        + _button(review_action_url(review_url, record_id=record_id, decision="approved", production_content_type="Thumbnail / Promo Still", production_platforms="Instagram,Facebook,YouTube", include_voiceover="No", include_background_music="No", include_thumbnail="Yes"), "Thumbnail / Promo Still", "#475569")
        + "</div>"
        '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 10px 0;font-weight:bold;color:#111827;">Tune / Reject / Remove</p>'
        + _button(review_action_url(review_url, record_id=record_id, decision="tune"), "Tune Requested", "#d97706")
        + _button(review_action_url(review_url, record_id=record_id, decision="rejected"), "Reject", "#b91c1c")
        + _button(review_action_url(review_url, record_id=record_id, decision="deleted"), "Remove", "#64748b")
        + "</div></div>"
    )


def review_email_html(candidates: list[dict[str, Any]], *, review_url: str) -> str:
    cards = "".join(candidate_card(record, review_url=review_url) for record in candidates)
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111827;background:#f9fafb;padding:20px;">'
        '<div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;">'
        '<h2 style="margin:0 0 8px 0;">ChicagoShining Idea Candidates Ready for Review</h2>'
        '<p style="margin:0 0 16px 0;color:#4b5563;">These generated candidates are ready for review. Video, carousel, post, story, and still options are now grouped separately.</p>'
        f'<p style="margin:0 0 16px 0;"><b>Total candidates:</b> {len(candidates)}</p>'
        f'<p style="margin:0 0 20px 0;"><a href="{_esc(I2_BACKUP_VIEW_URL)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;">Open Airtable Backup View</a></p>'
        f"{cards}"
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'
        "<p><b>How to review:</b></p>"
        "<ul><li><b>Approve / Use Airtable Config</b> marks the candidate Approved and preserves Production_* fields already set in Airtable.</li>"
        "<li><b>Carousel Options</b> open the I3 carousel form for slide count and media flags.</li>"
        "<li><b>Video Options</b> open the I3 video form for duration, optional clip count, and media flags.</li>"
        "<li><b>Post / Story Options</b> approve immediately with static/story production settings.</li>"
        "<li><b>Tune / Reject / Remove</b> handles non-production decisions.</li></ul>"
        '<p style="font-size:12px;color:#6b7280;margin:18px 0 0 0;">Generated by Python I2. After this email sends, these records are marked Sent for Review.</p>'
        "</div></div>"
    )


def review_subject(candidates: list[dict[str, Any]]) -> str:
    return f"ChicagoShining Idea Candidates Ready for Review - v29 Balanced Options - {len(candidates)} candidates"
