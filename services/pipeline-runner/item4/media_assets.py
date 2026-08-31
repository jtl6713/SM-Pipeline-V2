from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import MEDIA_ASSETS_TABLE
from integrations.google_drive import GoogleDriveClient


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_by_transfer_id(client: AirtableClient, transfer_id: str) -> dict | None:
    formula = f"{{Studio_Transfer_ID}}='{transfer_id.replace(chr(39), chr(92)+chr(39))}'"
    rows = client.list_records(MEDIA_ASSETS_TABLE, formula=formula, max_records=1)
    return rows[0] if rows else None


def create_master_media_asset(
    client: AirtableClient,
    fields: dict[str, Any],
    drive_id: str,
    drive_url: str,
    transfer_id: str,
) -> dict:
    name = str(fields.get("Source_Name") or fields.get("Target_File_Name") or "photo")
    ext = str(fields.get("Source_Extension") or "").lower()
    mime = str(fields.get("Source_MIME_Type") or "").lower()
    is_video = mime.startswith("video/") or ext in {"mp4", "mov", "m4v", "webm"}
    width = fields.get("Width")
    height = fields.get("Height")
    orientation = "Portrait"
    if width and height and float(width) < float(height):
        orientation = "Portrait"
    elif width and height:
        orientation = "Landscape"

    body = {
        "Asset Name": name,
        "Media_Class": "Video" if is_video else "Image",
        "Google Drive URL": drive_url,
        "Google Drive File ID": drive_id,
        "MIME_Type": str(fields.get("Source_MIME_Type") or "application/octet-stream"),
        "File_Extension": ext.upper() if ext else None,
        "File_Size_Bytes": fields.get("Source_Size_Bytes"),
        "Intake_Status": "Created",
        "Intake_Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "Drive_Access_Status": "Private",
        "Asset_Status": "Available",
        "Active": True,
        "Do_Not_Use": False,
        "Capture_Source": "Self Filmed",
        "Rights_Status": "Owned",
        "Orientation": orientation,
        "Asset_Role": "Raw Footage" if is_video else "Other",
        "Raw_Source_Eligibility": "Eligible" if is_video else "Not Applicable",
        "Asset_Description": (
            "Studio Item 4 authoritative master clip preserved in Google Drive."
            if is_video
            else "Studio Item 4 authoritative master original preserved in Google Drive."
        ),
        "Studio_Transfer_ID": transfer_id,
    }
    return client.create_records(MEDIA_ASSETS_TABLE, [body])[0]


def create_variant_media_asset(
    client: AirtableClient,
    fields: dict[str, Any],
    drive_id: str,
    drive_url: str,
    transfer_id: str,
) -> dict:
    ratio = str(fields.get("Aspect_Ratio") or "").strip()
    name = str(fields.get("Target_File_Name") or fields.get("Source_Name") or "variant")
    body = {
        "Asset Name": name,
        "Media_Class": "Image",
        "Google Drive URL": drive_url,
        "Google Drive File ID": drive_id,
        "MIME_Type": "image/jpeg",
        "File_Extension": "JPG",
        "File_Size_Bytes": fields.get("Source_Size_Bytes"),
        "Intake_Status": "Created",
        "Intake_Date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "Drive_Access_Status": "Private",
        "Asset_Status": "Available",
        "Active": True,
        "Do_Not_Use": False,
        "Capture_Source": "Self Filmed",
        "Rights_Status": "Owned",
        "Asset_Role": "Other",
        "Raw_Source_Eligibility": "Not Applicable",
        "Asset_Description": (
            f"Studio Item 4 platform-ready variant ({ratio}) preserved in Google Drive."
            if ratio
            else "Studio Item 4 platform-ready variant preserved in Google Drive."
        ),
        "Studio_Transfer_ID": transfer_id,
    }
    return client.create_records(MEDIA_ASSETS_TABLE, [body])[0]


def ensure_media_asset(
    client: AirtableClient,
    fields: dict[str, Any],
    drive_id: str,
    drive_url: str,
    transfer_id: str,
    *,
    kind: str,
) -> str:
    existing = find_by_transfer_id(client, transfer_id)
    if existing:
        return existing["id"]
    if kind == "Master Original":
        created = create_master_media_asset(client, fields, drive_id, drive_url, transfer_id)
    else:
        created = create_variant_media_asset(client, fields, drive_id, drive_url, transfer_id)
    return created["id"]
