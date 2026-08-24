"""P5 location-grouped reminder email (Make 5536624 modules 4/5)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore[misc, assignment]


def chicago_now() -> datetime:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("America/Chicago"))
        except Exception:
            pass
    return datetime.now(timezone(timedelta(hours=-5)))

from p5.constants import ASSET_NEEDS_DASHBOARD_URL  # noqa: E402


def _text(value: Any, fallback: str = "Not specified.") -> str:
    text = str(value or "").strip()
    return text or fallback


def shot_card(shot: dict[str, Any], content_title: str) -> str:
    fields = shot.get("fields", {})
    due = fields.get("Due_Date")
    due_label = "Not set"
    if due:
        try:
            parsed = datetime.fromisoformat(str(due).replace("Z", "+00:00"))
            due_label = f"{parsed.strftime('%b')} {parsed.day}, {parsed.year}"
        except ValueError:
            due_label = str(due)
    audio = "Yes" if fields.get("Audio_Needed") else "No"
    return f"""<li style="list-style:none; margin:0 0 18px 0; padding:0;">
  <div style="border:1px solid #dddddd; border-radius:10px; overflow:hidden; background:#ffffff;">
    <div style="background:#f1f1f1; padding:10px 14px; border-bottom:1px solid #dddddd;">
      <div style="font-size:12px; line-height:1.35; color:#666666; text-transform:uppercase; letter-spacing:.04em; font-weight:bold;">
        Filming location
      </div>
      <div style="font-size:17px; line-height:1.35; font-weight:bold; color:#111111;">
        {_text(fields.get("Location"), "Location not specified")}
      </div>
    </div>
    <div style="padding:12px 14px;">
      <div style="font-size:16px; line-height:1.45; margin-bottom:8px;">
        <strong>{_text(content_title, "Content Item")}</strong><br>
        <span style="font-size:14px; color:#444444;">
          Shot {fields.get("Shot_Number")} / {fields.get("Asset_Type")}
        </span>
      </div>
      <div style="font-size:14px; line-height:1.5; color:#222222; margin-bottom:10px;">
        <strong>Status:</strong> {fields.get("Shot_Status")} |
        <strong>Priority:</strong> {fields.get("Priority")}<br>
        <strong>Format:</strong> {fields.get("Orientation")} / {fields.get("Aspect_Ratio")} |
        <strong>Raw capture:</strong> {fields.get("Recommended_Raw_Capture_Seconds")} sec |
        <strong>Audio:</strong> {audio}<br>
        <strong>Due:</strong> {due_label}
      </div>
      <div style="margin-top:10px; padding:12px 14px; background:#f7f7f7; border-left:4px solid #d71920; border-radius:6px;">
        <div style="font-size:14px; line-height:1.5; margin-bottom:10px;">
          <strong>Why needed:</strong><br>
          {_text(fields.get("Why_Needed"))}
        </div>
        <div style="font-size:14px; line-height:1.5; margin-bottom:10px;">
          <strong>Capture instructions:</strong><br>
          {_text(fields.get("Capture_Instructions"))}
        </div>
        <div style="font-size:14px; line-height:1.5; margin-bottom:10px;">
          <strong>Avoid:</strong><br>
          {_text(fields.get("Avoid"))}
        </div>
        <div style="font-size:14px; line-height:1.5;">
          <strong>Example overlay text:</strong><br>
          <em>{_text(fields.get("Example_Overlay_Text"))}</em>
        </div>
      </div>
    </div>
  </div>
</li>"""


def reminder_subject(count: int, when: datetime | None = None) -> str:
    chicago = when or chicago_now()
    stamp = f"{chicago.strftime('%b')} {chicago.day}, {chicago.year}"
    return f"ChicagoShining Capture List by Location — {count} open shot(s) — {stamp}"


def reminder_html(cards: list[str], *, count: int, when: datetime | None = None) -> str:
    chicago = when or chicago_now()
    date_label = f"{chicago.strftime('%B')} {chicago.day}, {chicago.year}"
    return f"""<p>You still have open ChicagoShining asset needs.</p>

<p>
<strong>Total open asset shot requests:</strong> {count}<br>
<strong>Reminder date:</strong> {date_label}
</p>

<p>
<strong>Open full asset needs dashboard:</strong><br>
<a href="{ASSET_NEEDS_DASHBOARD_URL}">
View all open ChicagoShining asset needs
</a>
</p>

<p style="font-size:18px; font-weight:bold; margin-top:24px;">
Open shot summary by filming location
</p>

<p style="font-size:13px; line-height:1.45; color:#666666; margin-top:4px;">
Sorted by filming location, then content item, then shot number so you can capture related shots together while you are on site.
</p>

<ul style="padding-left:0; margin-top:14px;">
{"".join(cards)}
</ul>

<p style="margin-top:24px; font-size:13px; color:#666666;">
This P5 reminder includes the key capture instructions for each open shot. Use the Airtable Interface for status updates, uploads, and the full open asset needs dashboard.
</p>"""
