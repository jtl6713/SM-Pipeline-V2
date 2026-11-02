import os
import unittest
from unittest.mock import patch

from rendering_review.native_gallery_rights_registration import (
    NativeGalleryRightsDenied, register_native_gallery_rights,
)

O = "rec00000000000001"
P = "rec00000000000002"
C = "rec00000000000003"
S = "rec00000000000004"
RID = "rec00000000000005"
D = "private_v2_drive_file_123456789"
F = "private_v2_folder_file_123456789"
SHA = "a" * 64
JOB = "ngjob_01234567890123456789"


class Drive:
    def __init__(self):
        self.permissions = [{"type": "user", "role": "owner"}]

    def get_file(self, _id):
        return {"id": D, "mimeType": "image/png", "parents": [F],
                "trashed": False}

    def list_file_permissions(self, _id):
        return self.permissions


class Airtable:
    def __init__(self):
        self.calls = 0
        self.fields = None
        self.existing = []

    def list_records(self, _table, **_kwargs):
        return self.existing

    def upsert_record(self, _table, fields, *, merge_field, typecast):
        self.calls += 1
        self.fields = fields
        assert merge_field == "Studio_Transfer_ID"
        assert typecast is False
        return {"id": RID}, True

    def get_record(self, _table, _record_id):
        return {"id": RID, "fields": self.fields}


def approved(**kw):
    return {"approved": True, "provider": "OpenAI",
            "rights_basis": "Verified provider-generated model image"}


def register(client=None, drive=None, clearance=approved):
    return register_native_gallery_rights(
        client=client or Airtable(), drive=drive or Drive(),
        output_id=O, profile_id=P, content_item_id=C,
        slot_id=S, job_id=JOB, file_id=D, sha256=SHA,
        byte_count=4096, rights_clearance=clearance,
        staging_folder_id=F)


class RightsTests(unittest.TestCase):
    @patch("rendering_review.native_gallery_rights_registration.matching_owned_media",
           return_value=RID)
    @patch("rendering_review.native_gallery_rights_registration.actual_image",
           return_value=({"mime_type": "image/png", "sha256": SHA,
                          "byte_count": 4096}, b"png"))
    def test_exact_new_owned_catalog_readback(self, _actual, _owned):
        client = Airtable()
        result = register(client=client)
        self.assertTrue(result["verified"])
        self.assertFalse(result["publication_authorized"])
        self.assertEqual(client.calls, 1)
        self.assertEqual(client.fields["Content_Profile"], [P])
        self.assertEqual(client.fields["Google Drive File ID"], D)
        self.assertEqual(client.fields["Rights_Status"], "Owned")
        self.assertNotIn("Google Drive URL", client.fields)

    @patch("rendering_review.native_gallery_rights_registration.actual_image",
           return_value=({"mime_type": "image/png", "sha256": SHA,
                          "byte_count": 4096}, b"png"))
    def test_without_rights_approval_never_writes(self, _actual):
        client = Airtable()
        with self.assertRaisesRegex(NativeGalleryRightsDenied, "not_cleared"):
            register(client=client, clearance=lambda **_: {"approved": False})
        self.assertEqual(client.calls, 0)

    def test_public_file_never_catalogued(self):
        drive = Drive()
        drive.permissions = [{"type": "anyone", "role": "reader"}]
        client = Airtable()
        with self.assertRaisesRegex(NativeGalleryRightsDenied, "not_private"):
            register(client=client, drive=drive)
        self.assertEqual(client.calls, 0)

    @patch("rendering_review.native_gallery_rights_registration.actual_image",
           return_value=({"mime_type": "image/png", "sha256": "b" * 64,
                          "byte_count": 4096}, b"png"))
    def test_tampered_bytes_never_catalogued(self, _actual):
        client = Airtable()
        with self.assertRaisesRegex(NativeGalleryRightsDenied, "bytes_changed"):
            register(client=client)
        self.assertEqual(client.calls, 0)

    @patch("rendering_review.native_gallery_rights_registration.actual_image",
           return_value=({"mime_type": "image/png", "sha256": SHA,
                          "byte_count": 4096}, b"png"))
    def test_existing_transfer_never_overwritten(self, _actual):
        client = Airtable()
        client.existing = [{"id": RID}]
        with self.assertRaisesRegex(NativeGalleryRightsDenied, "existing_or_ambiguous"):
            register(client=client)
        self.assertEqual(client.calls, 0)

    @patch("rendering_review.native_gallery_rights_registration.actual_image",
           return_value=({"mime_type": "image/png", "sha256": SHA,
                          "byte_count": 4096}, b"png"))
    def test_ambiguous_write_never_retries(self, _actual):
        class Uncertain(Airtable):
            def upsert_record(self, *args, **kwargs):
                self.calls += 1
                raise TimeoutError("ambiguous Airtable response")
        client = Uncertain()
        with self.assertRaisesRegex(NativeGalleryRightsDenied, "ambiguous_write"):
            register(client=client)
        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
