"""No-network safety tests for Airtable-sourced private gallery staging."""
import os
import unittest
from unittest.mock import patch

from airtable.constants import PIPELINE_SETTINGS_TABLE
from rendering_review.native_gallery_staging_settings import (
    NativeGalleryStagingDenied, resolve_private_native_gallery_staging_folder,
)

FOLDER = "1VdULNl85JDoL_EaurRKMPm0tRi8xOawH"


class FakeAirtable:
    def __init__(self, rows=None):
        self.rows = rows if rows is not None else [self.good_row()]
        self.queries = []

    @staticmethod
    def good_row():
        return {"fields": {"Setting_Name": "NATIVE_GALLERY_STAGING_FOLDER_ID",
                           "Setting_Value": FOLDER, "Active": True}}

    def list_records(self, table, **kwargs):
        self.queries.append((table, kwargs))
        return self.rows


class FakeDrive:
    def __init__(self, *, shared=False, permissions=None):
        self.shared = shared
        self.permissions = permissions if permissions is not None else [
            {"type": "user", "role": "owner"}]
        self.reads = []

    def get_file(self, folder_id, **kwargs):
        self.reads.append(("metadata", folder_id, kwargs))
        return {"id": folder_id, "mimeType": "application/vnd.google-apps.folder",
                "trashed": False, "shared": self.shared}

    def list_file_permissions(self, folder_id):
        self.reads.append(("permissions", folder_id))
        return self.permissions


class StagingSettingsTests(unittest.TestCase):
    def test_one_active_setting_and_owner_only_drive_folder(self):
        client, drive = FakeAirtable(), FakeDrive()
        with patch.dict(os.environ, {"NATIVE_GALLERY_STAGING_FOLDER_ID": ""}):
            self.assertEqual(resolve_private_native_gallery_staging_folder(client, drive), FOLDER)
        self.assertEqual(client.queries[0][0], PIPELINE_SETTINGS_TABLE)
        self.assertEqual(client.queries[0][1]["max_records"], 2)
        self.assertEqual([k for k, *_ in drive.reads], ["metadata", "permissions"])

    def test_missing_duplicate_or_inactive_setting_denies_without_drive_io(self):
        for rows in ([], [FakeAirtable.good_row(), FakeAirtable.good_row()],
                     [{"fields": {**FakeAirtable.good_row()["fields"], "Active": False}}],
                     [{"fields": {**FakeAirtable.good_row()["fields"], "Setting_Value": "../unsafe"}}]):
            drive = FakeDrive()
            with patch.dict(os.environ, {"NATIVE_GALLERY_STAGING_FOLDER_ID": ""}):
                with self.assertRaises(NativeGalleryStagingDenied):
                    resolve_private_native_gallery_staging_folder(FakeAirtable(rows), drive)
            self.assertEqual(drive.reads, [])

    def test_env_pin_cannot_override_canonical_setting(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_STAGING_FOLDER_ID": "otherfolder12345678901234567890"}):
            drive = FakeDrive()
            with self.assertRaisesRegex(NativeGalleryStagingDenied, "env_pin_conflict"):
                resolve_private_native_gallery_staging_folder(FakeAirtable(), drive)
            self.assertEqual(drive.reads, [])

    def test_inaccessible_or_shared_folder_denies(self):
        for drive in (FakeDrive(shared=True),
                      FakeDrive(permissions=[{"type": "anyone", "role": "reader"}]),
                      FakeDrive(permissions=[{"type": "user", "role": "owner"},
                                             {"type": "user", "role": "reader"}]),
                      FakeDrive(permissions=[])):
            with patch.dict(os.environ, {"NATIVE_GALLERY_STAGING_FOLDER_ID": ""}):
                with self.assertRaises(NativeGalleryStagingDenied):
                    resolve_private_native_gallery_staging_folder(FakeAirtable(), drive)

    def test_airtable_or_drive_errors_abort(self):
        class BrokenAirtable:
            def list_records(self, *args, **kwargs):
                raise TimeoutError("offline")
        class BrokenDrive:
            def get_file(self, *args, **kwargs):
                raise PermissionError("no access")
        with patch.dict(os.environ, {"NATIVE_GALLERY_STAGING_FOLDER_ID": ""}):
            with self.assertRaisesRegex(NativeGalleryStagingDenied, "airtable_unavailable"):
                resolve_private_native_gallery_staging_folder(BrokenAirtable(), FakeDrive())
            with self.assertRaisesRegex(NativeGalleryStagingDenied, "drive_unavailable"):
                resolve_private_native_gallery_staging_folder(FakeAirtable(), BrokenDrive())


if __name__ == "__main__":
    unittest.main()
