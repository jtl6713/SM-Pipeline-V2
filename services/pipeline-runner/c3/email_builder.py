"""C3 parent review email — Make 5587853 module 2/4 HTML."""

from __future__ import annotations

import html
from typing import Any
from urllib.parse import quote

from render.fields import field, field_str


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _button(url: str, label: str, color: str) -> str:
    return (
        f'<a href="{_esc(url)}" style="display:inline-block;padding:9px 12px;color:#ffffff;'
        f'text-decoration:none;border-radius:7px;font-weight:bold;margin-right:8px;'
        f'margin-bottom:8px;background:{color};">{_esc(label)}</a>'
    )


def review_action_url(base_url: str, action: str, **params: str) -> str:
    base = (base_url or "").rstrip("/")
    query = [f"action={quote(action)}"]
    for key, value in params.items():
        if value:
            query.append(f"{quote(key)}={quote(str(value))}")
    return f"{base}?{'&'.join(query)}"


def slide_card(parent: dict[str, Any], slide: dict[str, Any], *, review_url: str) -> str:
    slide_id = slide["id"]
    content_id = field(parent, "Content_ID")
    title = field_str(parent, "Content_Title")
    return (
        '<div style="border:1px solid #e5e7eb;border-radius:12px;margin:0 0 18px 0;padding:14px;background:#ffffff;">'
        '<div style="background:#111827;color:#ffffff;border-radius:9px;padding:10px 12px;margin:0 0 12px 0;">'
        f'<div style="font-size:15px;font-weight:bold;">CI-{_esc(content_id)} — {_esc(title)}</div>'
        f'<div style="font-size:12px;margin-top:3px;opacity:.9;">Parent Airtable Record: {_esc(parent["id"])}</div>'
        "</div>"
        f'<h3 style="margin:0 0 6px 0;color:#111827;">Slide {field(slide, "Slide Number")} — {_esc(field_str(slide, "Slide Name"))}</h3>'
        '<p style="margin:0 0 8px 0;color:#4b5563;font-size:13px;">'
        f'<b>Platform:</b> {_esc(field_str(slide, "Platform"))} &nbsp; | &nbsp; '
        f'<b>Order:</b> {_esc(field(slide, "Current Order"))} &nbsp; | &nbsp; '
        f'<b>Ratio:</b> {_esc(field_str(slide, "AI Image Ratio") or field_str(slide, "Aspect Ratio"))} &nbsp; | &nbsp; '
        f'<b>Mode:</b> {_esc(field_str(slide, "Image Generation Mode"))} &nbsp; | &nbsp; '
        f'<b>Source:</b> {_esc(field_str(slide, "Image Source") or field_str(slide, "Image Generation Mode"))}</p>'
        f'<p style="margin:0 0 8px 0;color:#4b5563;font-size:12px;"><b>Slide Record ID:</b> {_esc(slide_id)} &nbsp; | &nbsp; '
        f'<b>Drive File ID:</b> {_esc(field_str(slide, "Google Drive File ID"))}</p>'
        f'<img src="{_esc(field_str(slide, "Current Image URL"))}" alt="{_esc(field_str(slide, "Slide Name"))}" '
        'style="display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid #e5e7eb;margin:10px 0;">'
        f'<p style="margin:8px 0 0 0;font-size:13px;color:#374151;"><b>Prompt:</b> {_esc(field_str(slide, "AI Prompt"))}</p>'
        '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb;">'
        '<p style="margin:0 0 10px 0;font-weight:bold;color:#111827;">Slide decision:</p>'
        + _button(review_action_url(review_url, "approve", slide_id=slide_id), "Approve", "#15803d")
        + _button(review_action_url(review_url, "manual_replace", slide_id=slide_id), "Request Manual Replacement", "#b45309")
        + _button(review_action_url(review_url, "manual_form", slide_id=slide_id), "Manual Replacement with Notes", "#2563eb")
        + _button(review_action_url(review_url, "try_ai", slide_id=slide_id), "Regenerate with AI", "#7c3aed")
        + _button(review_action_url(review_url, "ai_form", slide_id=slide_id), "Regenerate with AI + Notes", "#6d28d9")
        + _button(review_action_url(review_url, "delete", slide_id=slide_id), "Delete", "#b91c1c")
        + "</div>"
        '<p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;"><b>Safe path:</b> Manual Replacement keeps this slide '
        "in the manual-upload flow. Regenerate with AI intentionally switches it into the AI-generation flow.</p></div>"
    )


def review_email_html(
    parent: dict[str, Any],
    slides: list[dict[str, Any]],
    *,
    review_url: str,
    slides_table_url: str,
) -> str:
    cards = "".join(slide_card(parent, slide, review_url=review_url) for slide in slides)
    first = slides[0] if slides else {}
    content_id = field(parent, "Content_ID")
    title = field_str(parent, "Content_Title")
    platform = field_str(first, "Platform")
    parent_id = parent["id"]
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111827;background:#f9fafb;padding:20px;">'
        '<div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;">'
        "<h2 style=\"margin:0 0 8px 0;\">ChicagoShining Carousel Ready for Review</h2>"
        '<p style="margin:0 0 16px 0;color:#4b5563;">This email contains slides for one Content Item only. '
        "Every slide card repeats the Content ID, title, parent record ID, slide number, order, and slide record ID.</p>"
        '<div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:18px;">'
        f'<p style="margin:4px 0;"><b>Content ID:</b> {_esc(content_id)}</p>'
        f'<p style="margin:4px 0;"><b>Title:</b> {_esc(title)}</p>'
        f'<p style="margin:4px 0;"><b>Parent Airtable Record ID:</b> {_esc(parent_id)}</p>'
        f'<p style="margin:4px 0;"><b>Platform:</b> {_esc(platform)}</p>'
        f'<p style="margin:4px 0;"><b>Slides in this email:</b> {len(slides)}</p>'
        f'<p style="margin:4px 0;"><b>Primary image mode:</b> {_esc(field_str(first, "Image Generation Mode"))}</p>'
        f'<p style="margin:4px 0;"><b>Location:</b> {_esc(field_str(parent, "Location"))} / {_esc(field_str(parent, "Neighborhood"))}</p>'
        f'<p style="margin:8px 0 0 0;"><b>Hook:</b> {_esc(field_str(parent, "Hook"))}</p>'
        f'<p style="margin:8px 0 0 0;"><b>Summary:</b> {_esc(field_str(parent, "Summary"))}</p></div>'
        f'<p style="margin:0 0 16px 0;"><a href="{_esc(slides_table_url)}" style="display:inline-block;background:#111827;'
        'color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:bold;">Open Carousel Slides Table</a></p>'
        '<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:14px;margin-bottom:18px;">'
        '<p style="margin:0 0 10px 0;font-weight:bold;">Batch actions for this Content Item only</p>'
        '<p style="margin:0 0 12px 0;color:#4b5563;">Manual replacement keeps the carousel in manual-upload mode. '
        "Regenerate with AI intentionally moves the set into the AI-generation path.</p>"
        + _button(
            review_action_url(review_url, "global_manual_form", content_item_id=parent_id),
            "Request Manual Replacements for All Slides",
            "#b45309",
        )
        + _button(
            review_action_url(review_url, "global_ai_form", content_item_id=parent_id),
            "Regenerate All Slides with AI",
            "#7c3aed",
        )
        + "</div>"
        '<div style="border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;padding:14px;margin-bottom:18px;">'
        '<p style="margin:0 0 8px 0;font-weight:bold;">Review instructions</p>'
        "<ul style=\"margin:0;padding-left:20px;\">"
        "<li><b>Approve</b> marks the slide approved for final.</li>"
        "<li><b>Request Manual Replacement</b> keeps the slide in the manual-upload flow.</li>"
        "<li><b>Regenerate with AI</b> intentionally creates another AI version.</li>"
        "<li><b>Delete</b> removes the slide from the active carousel set.</li>"
        "<li>Each review decision is handed to C4 automatically after it is committed.</li>"
        "<li>For manual replacements: after C4, upload the replacement and run <b>C2M</b>.</li>"
        "</ul></div>"
        f"{cards}"
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">'
        '<p style="font-size:12px;color:#6b7280;margin:0;">Generated by C3 v36.1 — one parent carousel per email, '
        "with self-identifying slide cards.</p></div></div>"
    )


def review_subject(parent: dict[str, Any], slides: list[dict[str, Any]]) -> str:
    first = slides[0] if slides else {}
    return (
        f"ChicagoShining Carousel Review — CI-{field(parent, 'Content_ID')} — "
        f"{field_str(parent, 'Content_Title')} — {field_str(first, 'Platform')} — {len(slides)} slides"
    )
