from __future__ import annotations

import html
from datetime import datetime, timezone
from typing import Any

from render.fields import field_str


def _link(label: str, url: str) -> str:
    safe_url = html.escape(url or "", quote=True)
    if not safe_url:
        return html.escape(label)
    return f'<a href="{safe_url}">{html.escape(label)}</a>'


def _decision_button(
    record_id: str,
    decision: str,
    label: str,
    color: str,
    *,
    decision_webhook_url: str,
) -> str:
    base = decision_webhook_url.rstrip("/")
    href = (
        f"{base}?record_id={html.escape(record_id, quote=True)}"
        f"&decision={html.escape(decision, quote=True)}"
    )
    return (
        f'<a href="{href}" style="display:inline-block;padding:10px 14px;'
        f"background:{color};color:#ffffff;text-decoration:none;border-radius:6px;"
        f'font-weight:bold;margin-right:8px;margin-bottom:8px;">{html.escape(label)}</a>'
    )


def build_review_card(
    output: dict[str, Any],
    *,
    decision_webhook_url: str,
) -> str:
    record_id = output["id"]
    output_id = html.escape(field_str(output, "Output_ID"))
    title = html.escape(field_str(output, "Output_Title"))
    platform = html.escape(field_str(output, "Platform"))
    fmt = html.escape(field_str(output, "Format"))
    output_type = html.escape(field_str(output, "Platform_Output_Type"))
    aspect = html.escape(field_str(output, "Aspect_Ratio"))
    final_url = field_str(output, "Final_File_URL")
    review_images = field_str(output, "Selected_Review_Images_HTML")
    thumbnail_url = field_str(output, "Thumbnail_URL")
    caption = html.escape(field_str(output, "Output_Caption"))
    hashtags = html.escape(field_str(output, "Output_Hashtags"))
    asset_summary = html.escape(field_str(output, "Selected_Asset_Summary"))

    decisions = "".join(
        [
            _decision_button(
                record_id, "approved", "Approve for Publishing", "#15803d",
                decision_webhook_url=decision_webhook_url,
            ),
            _decision_button(
                record_id, "changes", "Changes Requested", "#ca8a04",
                decision_webhook_url=decision_webhook_url,
            ),
            _decision_button(
                record_id, "rejected", "Reject", "#b91c1c",
                decision_webhook_url=decision_webhook_url,
            ),
            _decision_button(
                record_id, "do_not_publish", "Do Not Publish", "#374151",
                decision_webhook_url=decision_webhook_url,
            ),
        ]
    )

    return f"""<div style="border:1px solid #ddd;border-radius:10px;padding:16px;margin:0 0 18px 0;background:#ffffff;">
  <h3 style="margin:0 0 8px 0;color:#111827;">Output #{output_id} - {title}</h3>
  <p style="margin:6px 0;color:#374151;"><b>Platform / Format:</b> {platform} / {fmt} &nbsp; | &nbsp; <b>Type:</b> {output_type} &nbsp; | &nbsp; <b>Aspect:</b> {aspect}</p>
  <p style="margin:6px 0;"><b>Rendered video (if applicable):</b> {_link("Open final rendered file", final_url)}</p>
  <p style="margin:6px 0;"><b>Ordered review images:</b><br>
    {review_images}
  </p>
  <p style="margin:6px 0;"><b>Thumbnail:</b> {_link("Open thumbnail", thumbnail_url)}</p>
  <p style="margin:10px 0 4px 0;"><b>Caption:</b></p>
  <div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">{caption}</div>
  <p style="margin:10px 0 4px 0;"><b>Hashtags:</b></p>
  <div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">{hashtags}</div>
  <p style="margin:10px 0 4px 0;"><b>Selected assets:</b></p>
  <div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">{asset_summary}</div>
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 10px 0;font-weight:bold;color:#111827;">Decision:</p>
    {decisions}
  </div>
</div>"""


def build_review_email_html(cards: list[str]) -> str:
    joined = "".join(cards)
    total = len(cards)
    return f"""<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111827;background:#f9fafb;padding:20px;">
  <div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;">
    <h2 style="margin:0 0 8px 0;">ChicagoShining Outputs Ready for Review</h2>
    <p style="margin:0 0 16px 0;color:#4b5563;">Rendered video outputs include the final MP4. Native photo-set outputs, including TikTok slideshows, are reviewed from the ordered source images and do not require an MP4.</p>
    <p style="margin:0 0 16px 0;"><b>Total outputs:</b> {total}</p>
    {joined}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0 0 8px 0;"><b>Decision meanings:</b></p>
    <ul style="margin-top:0;">
      <li><b>Approve for Publishing</b> - marks this Platform Output approved and ready for scheduling/publishing.</li>
      <li><b>Changes Requested</b> - removes it from the publish path and marks the output as needing changes.</li>
      <li><b>Reject</b> - rejects the output and prevents publishing.</li>
      <li><b>Do Not Publish</b> - prevents publishing.</li>
    </ul>
    <p style="font-size:12px;color:#6b7280;margin:18px 0 0 0;">Generated by RR1 - Output Review Email.</p>
  </div>
</div>"""


def review_email_subject(output_count: int, *, now: datetime | None = None) -> str:
    stamp = (now or datetime.now(timezone.utc)).strftime("%b %d, %Y")
    return f"ChicagoShining Outputs Ready for Review - {stamp} - {output_count} outputs"
