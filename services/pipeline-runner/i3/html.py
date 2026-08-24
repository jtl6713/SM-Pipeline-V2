"""I3 email-button forms and confirmations — Make 5517182 webhook responses."""

from __future__ import annotations

import html
from typing import Any

from idea.mapping import first_value
from render.fields import field_str


def _esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def confirmation(title: str, message: str) -> str:
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>"
        f"{_esc(title)}</title></head>"
        "<body style='font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827;'>"
        f"<h1>{_esc(title)}</h1><p>{_esc(message)}</p>"
        "<p style='color:#6b7280;font-size:13px;'>You can close this tab.</p>"
        "</body></html>"
    )


def carousel_form(candidate: dict[str, Any], payload: dict[str, Any]) -> str:
    record_id = first_value(payload, "record_id")
    mode = first_value(payload, "carousel_image_mode") or "Manual Upload"
    platforms = first_value(payload, "production_platforms") or "Instagram"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Configure Carousel</title>
<style>body{{font-family:Arial,Helvetica,sans-serif;background:#f9fafb;color:#111827;padding:24px}}.card{{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px}}label{{display:block;font-weight:700;margin-top:16px}}input,textarea,select{{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;margin-top:6px}}button{{margin-top:18px;background:#15803d;color:white;border:0;padding:12px 18px;border-radius:8px;font-weight:700;font-size:16px}}</style></head>
<body><div class="card"><h1>Configure Carousel Approval</h1>
<p><b>Idea:</b> {_esc(field_str(candidate, "Candidate_Title"))}</p>
<p><b>Mode:</b> {_esc(mode)} &nbsp; <b>Platforms:</b> {_esc(platforms)}</p>
<form method="GET">
<input type="hidden" name="action" value="carousel_submit">
<input type="hidden" name="record_id" value="{_esc(record_id)}">
<input type="hidden" name="production_content_type" value="Carousel">
<input type="hidden" name="production_platforms" value="{_esc(platforms)}">
<input type="hidden" name="carousel_image_mode" value="{_esc(mode)}">
<label>Carousel slide count</label>
<input type="number" name="carousel_slide_count" min="1" max="20" value="5">
<label>Include voiceover?</label>
<select name="include_voiceover"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Include background music?</label>
<select name="include_background_music"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Include thumbnail?</label>
<select name="include_thumbnail"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Optional production notes</label>
<textarea name="production_config_notes"></textarea>
<button type="submit">Approve Carousel with This Configuration</button>
</form></div></body></html>"""


def video_form(candidate: dict[str, Any], payload: dict[str, Any]) -> str:
    record_id = first_value(payload, "record_id")
    content_type = first_value(payload, "production_content_type") or "Vertical Short Video"
    platforms = first_value(payload, "production_platforms") or "Instagram"
    label = first_value(payload, "platform_label") or platforms
    asset_mode = first_value(payload, "video_asset_mode") or "Make/Render"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Configure Video</title>
<style>body{{font-family:Arial,Helvetica,sans-serif;background:#f9fafb;color:#111827;padding:24px}}.card{{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px}}label{{display:block;font-weight:700;margin-top:16px}}input,textarea,select{{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;margin-top:6px}}button{{margin-top:18px;background:#be185d;color:white;border:0;padding:12px 18px;border-radius:8px;font-weight:700;font-size:16px}}</style></head>
<body><div class="card"><h1>Configure Video Approval</h1>
<p><b>Idea:</b> {_esc(field_str(candidate, "Candidate_Title"))}</p>
<p><b>Content type:</b> {_esc(content_type)} &nbsp; <b>Platforms:</b> {_esc(label)}</p>
<p><b>Asset/render mode:</b> {_esc(asset_mode)}</p>
<form method="GET">
<input type="hidden" name="action" value="video_submit">
<input type="hidden" name="record_id" value="{_esc(record_id)}">
<input type="hidden" name="production_content_type" value="{_esc(content_type)}">
<input type="hidden" name="production_platforms" value="{_esc(platforms)}">
<input type="hidden" name="platform_label" value="{_esc(label)}">
<input type="hidden" name="video_asset_mode" value="{_esc(asset_mode)}">
<label>Video duration</label>
<select name="video_duration"><option value="15">15 seconds</option><option value="30" selected>30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="Custom">Custom duration</option></select>
<label>Custom duration in seconds</label>
<input type="number" name="custom_video_duration" min="5" max="600">
<label>Video clip count</label>
<select name="video_clip_count"><option value="Auto" selected>Auto</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="Custom">Custom</option></select>
<label>Custom clip count</label>
<input type="number" name="custom_video_clip_count" min="1" max="20">
<label>Include voiceover?</label>
<select name="include_voiceover"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Voiceover tail seconds</label>
<input type="number" name="voiceover_tail_seconds" min="0" max="10" step="0.5" value="2">
<label>Include background music?</label>
<select name="include_background_music"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Include thumbnail?</label>
<select name="include_thumbnail"><option value="Use Profile Default" selected>Use Profile Default</option><option value="Yes">Yes</option><option value="No">No</option></select>
<label>Optional production notes</label>
<textarea name="production_config_notes"></textarea>
<button type="submit">Approve Video with This Configuration</button>
</form></div></body></html>"""
