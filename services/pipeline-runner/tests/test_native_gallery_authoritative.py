import copy
import hashlib
from io import BytesIO
import unittest

from PIL import Image
from airtable.constants import (
    CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, CAROUSEL_SLIDES_TABLE,
    MEDIA_ASSETS_TABLE,
)
from rendering_review.gallery_authoritative import (
    GalleryPreflightDenied, read_authoritative_gallery_source,
)

OUTPUT = "rec00000000000001"
PROFILE = "rec00000000000002"
CONTENT = "rec00000000000003"
SLIDE = "rec00000000000004"
ASSET = "rec00000000000005"
DRIVE_ID = "gallery-original-drive-1234567890"


def png():
    image = Image.effect_noise((400, 500), 48).convert("RGB")
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


class FakeClient:
    def __init__(self):
        self.rows = {
            (PLATFORM_OUTPUTS_TABLE, OUTPUT): {"id": OUTPUT, "fields": {
                "Content_Item": [CONTENT], "Carousel Slides": [SLIDE],
                "Platform": "Instagram"}},
            (CONTENT_ITEMS_TABLE, CONTENT): {"id": CONTENT, "fields": {
                "Content_Profile": [PROFILE]}},
            (CAROUSEL_SLIDES_TABLE, SLIDE): {"id": SLIDE, "fields": {
                "Slide Number": 1, "Content Item": [CONTENT],
                "Platform Output": [OUTPUT], "Platform": "Instagram",
                "Aspect Ratio": "4:5", "Approved For Final": True,
                "Review Status": "Final Approved",
                "Asset_4x5_File_ID": DRIVE_ID}},
        }
        self.catalog = {"id": ASSET, "fields": {
            "Google Drive File ID": DRIVE_ID, "Content_Profile": [PROFILE],
            "Rights_Status": "Owned", "Asset_Status": "Available",
            "Active": True, "Do_Not_Use": False, "Media_Class": "Image"}}

    def get_record(self, table, record):
        return copy.deepcopy(self.rows[(table, record)])

    def list_records(self, table, *, formula, max_records):
        assert table == MEDIA_ASSETS_TABLE
        assert DRIVE_ID in formula and max_records == 2
        return [copy.deepcopy(self.catalog)]


class FakeDrive:
    def __init__(self, data):
        self.data = data
    def get_file(self, file_id):
        assert file_id == DRIVE_ID
        return {"id": file_id, "mimeType": "image/png",
                "size": str(len(self.data)), "trashed": False}
    def download_file(self, file_id):
        return self.data, "image/png"


def branding_resolver(**kwargs):
    return {"bytes": b"verified-mock", "receipt": {
        "verified": True, "profile_id": kwargs["profile_id"]}}


def check(client=None, drive=None):
    return read_authoritative_gallery_source(
        client=client or FakeClient(), drive=drive or FakeDrive(png()),
        output_id=OUTPUT, expected_profile_id=PROFILE,
        branding_resolver=branding_resolver)


class AuthoritativeSourceTests(unittest.TestCase):
    def test_exact_source_verified_but_never_launch_authorized(self):
        result = check()
        self.assertTrue(result["sources_byte_verified"])
        self.assertTrue(result["source_rights_verified"])
        self.assertEqual(result["slide_count"], 1)
        self.assertEqual(result["artifacts"][0]["source_media_asset_id"], ASSET)
        self.assertEqual(result["artifacts"][0]["content_item_id"], CONTENT)
        self.assertFalse(result["original_artifact_watermark_verified"])
        self.assertFalse(result["can_generate"])
        self.assertFalse(result["publication_authorized"])
        self.assertEqual(len(result["artifacts"][0]["sha256"]), 64)

    def test_cross_profile_source_denied(self):
        client = FakeClient()
        client.catalog["fields"]["Content_Profile"] = ["rec00000000000099"]
        with self.assertRaisesRegex(GalleryPreflightDenied, "rights_or_profile"):
            check(client=client)
        client = FakeClient()
        client.rows[(CONTENT_ITEMS_TABLE, CONTENT)]["fields"]["Content_Profile"] = [
            "rec00000000000099"]
        with self.assertRaisesRegex(GalleryPreflightDenied, "profile_not_authorized"):
            check(client=client)

    def test_unowned_or_ambiguous_source_denied(self):
        for value in ("Unclear", "Licensed"):
            client = FakeClient()
            client.catalog["fields"]["Rights_Status"] = value
            with self.assertRaises(GalleryPreflightDenied):
                check(client=client)
        client = FakeClient()
        client.list_records = lambda *_args, **_kwargs: [client.catalog, client.catalog]
        with self.assertRaisesRegex(GalleryPreflightDenied, "missing_or_ambiguous"):
            check(client=client)

    def test_tampered_decoded_format_or_ratio_denied(self):
        image = Image.new("RGB", (400, 500), "white")
        stream = BytesIO()
        image.save(stream, format="JPEG")
        with self.assertRaises(GalleryPreflightDenied):
            check(drive=FakeDrive(stream.getvalue()))
        client = FakeClient()
        client.rows[(CAROUSEL_SLIDES_TABLE, SLIDE)]["fields"]["Aspect Ratio"] = "1:1"
        with self.assertRaises(GalleryPreflightDenied):
            check(client=client)

    def test_disapproved_slide_denied(self):
        client = FakeClient()
        client.rows[(CAROUSEL_SLIDES_TABLE, SLIDE)]["fields"]["Approved For Final"] = False
        with self.assertRaisesRegex(GalleryPreflightDenied, "scope_or_approval"):
            check(client=client)


if __name__ == "__main__":
    unittest.main()
