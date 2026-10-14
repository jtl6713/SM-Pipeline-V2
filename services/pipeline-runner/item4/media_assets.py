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
            (
                f"Studio Item 4 ChicagoShining watermarked {'clip' if is_video else 'photo'} derivative. "
                f"[watermarked:{str(fields.get('Watermark_Profile') or 'ChicagoShining')}] "
                f"Source master Drive ID: {str(fields.get('Source_Master_Drive_File_ID') or '').strip()}"
            ).strip()
            if fields.get("Watermark_Profile")
            else (
                "Studio Item 4 authoritative master clip preserved in Google Drive."
                if is_video
                else "Studio Item 4 authoritative master original preserved in Google Drive."
            )
        ),
        "Studio_Transfer_ID": transfer_id,
        "Classification_Status": "Needs Classification",
    }
    profile = fields.get("Content_Profile")
    if profile:
        body["Content_Profile"] = profile
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
    source = None
    linked = fields.get("Source_Media_Asset") or []
    if isinstance(linked, list) and linked:
        linked_id = linked[0].get("id") if isinstance(linked[0], dict) else linked[0]
        if linked_id:
            try:
                source = client.get_record(MEDIA_ASSETS_TABLE, str(linked_id))
            except Exception:
                source = None
    if not source:
        source = find_by_drive_file_id(client, str(fields.get("Source_Drive_File_ID") or ""))
    body.update(classification_fields_from_source(source))
    return client.create_records(MEDIA_ASSETS_TABLE, [body])[0]


CLASSIFICATION_COPY_FIELDS = (
    "Topic",
    "Subtopic",
    "Location",
    "Visible_Subjects",
    "Mood",
    "Weather",
    "Season",
    "Time_Of_Day",
    "Shot_Type",
    "Movement",
    "AI_Tags",
    "Search_Keywords",
    "Quality_Score",
    "Usefulness_Score",
)


def classification_fields_from_source(source: dict[str, Any] | None) -> dict[str, Any]:
    if not source:
        return {"Classification_Status": "Needs Classification"}
    src = source.get("fields") if isinstance(source.get("fields"), dict) else source
    copied: dict[str, Any] = {}
    for key in CLASSIFICATION_COPY_FIELDS:
        value = src.get(key)
        if value not in (None, "", []):
            copied[key] = value
    profile = src.get("Content_Profile")
    if profile:
        copied["Content_Profile"] = profile
    copied["Classification_Status"] = "Classified" if copied.get("Search_Keywords") else "Needs Classification"
    return copied


def find_by_drive_file_id(client: AirtableClient, drive_id: str) -> dict | None:
    file_id = str(drive_id or "").strip()
    if not file_id:
        return None
    safe = file_id.replace("'", "\\'")
    rows = client.list_records(
        MEDIA_ASSETS_TABLE,
        formula=f"{{Google Drive File ID}}='{safe}'",
        max_records=5,
    )
    for row in rows:
        name = str((row.get("fields") or row).get("Asset Name") or "")
        if "fill-crop" in name.lower():
            continue
        return row
    return rows[0] if rows else None


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
        # AI masters can land before profile resolution existed. Backfill blank
        # Content_Profile from the queue/handoff fields so Asset Manager scopes them.
        wanted = fields.get("Content_Profile")
        existing_fields = existing.get("fields") if isinstance(existing.get("fields"), dict) else {}
        if wanted and not existing_fields.get("Content_Profile"):
            try:
                client.update_record(MEDIA_ASSETS_TABLE, existing["id"], {"Content_Profile": wanted})
            except Exception:
                pass
        return existing["id"]
    if kind == "Master Original":
        created = create_master_media_asset(client, fields, drive_id, drive_url, transfer_id)
    else:
        created = create_variant_media_asset(client, fields, drive_id, drive_url, transfer_id)
    return created["id"]
