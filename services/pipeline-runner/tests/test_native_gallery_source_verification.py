import hashlib
from io import BytesIO
import unittest
from PIL import Image
from rendering_review.gallery_source_verification import (
    verify_original_gallery_sources, SourceVerificationDenied,
)

OUTPUT = "rec00000000000001"
PROFILE = "rec00000000000002"
CONTENT = "rec00000000000003"
FID = "drive-original-image-1234567890"


def sample():
    stream = BytesIO()
    Image.new("RGB", (400, 500), "orange").save(stream, "PNG")
    return stream.getvalue()


class Drive:
    def __init__(self, raw):
        self.raw = raw
        self.mime = "image/png"
    def get_file(self, fid):
        return {"id": fid, "mimeType": self.mime, "trashed": False}
    def download_file(self, fid):
        return self.raw, self.mime


def claim(raw):
    return {"slot_id": "slide_0001", "order": 1, "drive_file_id": FID,
            "output_id": OUTPUT, "profile_id": PROFILE,
            "content_item_id": CONTENT, "mime_type": "image/png",
            "sha256": hashlib.sha256(raw).hexdigest(), "byte_count": len(raw),
            "width": 400, "height": 500, "airtable_identity_verified": True,
            "rights_verified": True, "watermark_verified": True}


def check(rows, drive):
    return verify_original_gallery_sources(
        output_id=OUTPUT, profile_id=PROFILE, content_item_id=CONTENT,
        aspect_ratio="4:5", slides=rows, drive=drive)


class OriginalGalleryVerificationTests(unittest.TestCase):
    def test_real_readback_and_order(self):
        raw = sample()
        result = check([claim(raw)], Drive(raw))
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0]["google_drive_verified"])
        self.assertEqual(result[0]["sha256"], hashlib.sha256(raw).hexdigest())

    def test_mutated_bytes_fail_closed(self):
        raw = sample()
        with self.assertRaises(SourceVerificationDenied):
            check([claim(raw)], Drive(raw + b"changed"))

    def test_foreign_profile_and_missing_rights_fail_closed(self):
        raw = sample()
        for key, value in (("profile_id", "rec99999999999999"),
                           ("rights_verified", False),
                           ("airtable_identity_verified", False)):
            row = claim(raw)
            row[key] = value
            with self.subTest(key=key):
                with self.assertRaises(SourceVerificationDenied):
                    check([row], Drive(raw))

    def test_bad_dimensions_or_order_fail_closed(self):
        raw = sample()
        for key, value in (("width", 401), ("order", 2)):
            row = claim(raw)
            row[key] = value
            with self.subTest(key=key):
                with self.assertRaises(SourceVerificationDenied):
                    check([row], Drive(raw))


if __name__ == "__main__":
    unittest.main()
