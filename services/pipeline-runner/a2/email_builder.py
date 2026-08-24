"""A2 intake notification email (Make 5531974 modules 32–36)."""

from __future__ import annotations

from html import escape


ROUTE_LABELS = {
    "video": "Video",
    "branding": "Graphic",
    "image": "Image",
    "other": "Other",
    "audio": "Audio",
}


def intake_subject(route: str, name: str) -> str:
    label = ROUTE_LABELS.get(route, "Other")
    return f"ChicagoShining Asset Intake — {label}: {name}"


def intake_email_html(
    *,
    route: str,
    name: str,
    media_class: str,
    asset_role: str,
    eligibility: str,
    folder_label: str,
    size_mb: float,
    mime: str,
    drive_link: str,
    record_id: str,
    batch_id: str,
) -> str:
    label = ROUTE_LABELS.get(route, "Other")
    return f"""
<!doctype html>
<html><body style="font-family:Arial,sans-serif;padding:20px;color:#111;">
  <p style="display:inline-block;background:#111;color:#fff;padding:4px 10px;border-radius:4px;">{escape(label)}</p>
  <h2>{escape(name)}</h2>
  <p>Routing class: <strong>{escape(media_class)}</strong><br>
  Asset role: <strong>{escape(asset_role)}</strong><br>
  Raw-source eligibility: <strong>{escape(eligibility)}</strong><br>
  Classification status: <strong>Pending A3</strong></p>
  <p>Destination folder: {escape(folder_label)}<br>
  File size: {size_mb:.2f} MB<br>
  MIME: {escape(mime)}</p>
  <p><a href="{escape(drive_link)}">Open in Google Drive</a><br>
  Airtable record: {escape(record_id)}<br>
  Intake batch: {escape(batch_id)}<br>
  Drive permission: Public</p>
  <p>A3 will perform final classification on this asset.</p>
</body></html>
""".strip()
