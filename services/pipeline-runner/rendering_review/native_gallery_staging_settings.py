"""Read-only Airtable-authoritative private C5/C6 staging destination gate.

No hard-coded folder and no env-only fallback. Called before any job claim.
The optional legacy .env pin may constrain but never override Airtable.
"""
from __future__ import annotations

import os
import re

from airtable.constants import PIPELINE_SETTINGS_TABLE

SETTING_NAME = "NATIVE_GALLERY_STAGING_FOLDER_ID"
FOLDER_ID = re.compile(r"[A-Za-z0-9_-]{20,}\Z")


class NativeGalleryStagingDenied(RuntimeError):
    """Safe, non-secret staging configuration/readback denial."""


def read_native_gallery_staging_setting(client):
    """Validate exactly one active Airtable folder ID, including optional env pin.

    This read-only check deliberately needs no Google Drive access, so an
    OAuth problem cannot masquerade as a missing Airtable setting.
    """
    try:
        rows = client.list_records(
            PIPELINE_SETTINGS_TABLE,
            formula='{Setting_Name}="' + SETTING_NAME + '"',
            max_records=2,
            fields=["Setting_Name", "Setting_Value", "Active"],
        )
    except Exception as exc:
        raise NativeGalleryStagingDenied("native_gallery_staging_airtable_unavailable") from exc
    if not isinstance(rows, list) or len(rows) != 1:
        raise NativeGalleryStagingDenied("native_gallery_staging_setting_not_unique")
    record = rows[0]
    fields = record.get("fields") if isinstance(record, dict) else None
    if (not isinstance(fields, dict)
            or fields.get("Setting_Name") != SETTING_NAME
            or fields.get("Active") is not True):
        raise NativeGalleryStagingDenied("native_gallery_staging_setting_inactive")
    folder = fields.get("Setting_Value")
    if not isinstance(folder, str) or not FOLDER_ID.fullmatch(folder):
        raise NativeGalleryStagingDenied("native_gallery_staging_folder_invalid")
    legacy_pin = os.environ.get(SETTING_NAME, "").strip()
    if legacy_pin and legacy_pin != folder:
        raise NativeGalleryStagingDenied("native_gallery_staging_env_pin_conflict")
    return folder


def verify_native_gallery_staging_permissions(drive, folder):
    """Check the same owner-only Drive gate used by live C5/C6 execution."""
    try:
        metadata = drive.get_file(folder, fields="id,mimeType,trashed,shared")
        permissions = drive.list_file_permissions(folder)
    except Exception as exc:
        raise NativeGalleryStagingDenied("native_gallery_staging_drive_unavailable") from exc
    if (not isinstance(metadata, dict)
            or metadata.get("id") != folder
            or metadata.get("mimeType") != "application/vnd.google-apps.folder"
            or metadata.get("trashed") is True
            or metadata.get("shared") is True
            or not isinstance(permissions, list)
            or len(permissions) != 1
            or not isinstance(permissions[0], dict)
            or permissions[0].get("type") != "user"
            or permissions[0].get("role") != "owner"):
        raise NativeGalleryStagingDenied("native_gallery_staging_not_owner_only")
    return True


def resolve_private_native_gallery_staging_folder(client, drive):
    """Read both authoritative systems BEFORE any claimed job or C5 call.

    No permission change, Airtable write, fallback folder, or token disclosure.
    """
    folder = read_native_gallery_staging_setting(client)
    verify_native_gallery_staging_permissions(drive, folder)
    return folder
