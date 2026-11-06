"""Native-gallery branding exception: exact asset only, never foreign source media."""
import unittest
from unittest.mock import patch

from rendering_review.profile_watermark import (
    ProfileWatermarkUnavailable, SHARED_NATIVE_GALLERY_WATERMARK_ASSET,
    SHARED_NATIVE_GALLERY_WATERMARK_DRIVE,
    SHARED_NATIVE_GALLERY_WATERMARK_PROFILE,
    SHARED_NATIVE_GALLERY_POLICY, resolve_native_gallery_watermark,
)

OTHER_PROFILE = "rec12345678901234"


class Catalog:
    def get_record(self, table, record_id):
        if record_id in (OTHER_PROFILE, SHARED_NATIVE_GALLERY_WATERMARK_PROFILE):
            return {"id": record_id, "fields": {"Profile_Name": "City"}}
        return {}


class NativeGallerySharedWatermarkTests(unittest.TestCase):
    def setUp(self):
        self.source = {"bytes": b"verified-test-placeholder", "receipt": {
            "verified": True, "authority": "server",
            "media_authority": "google_drive",
            "profile_id": SHARED_NATIVE_GALLERY_WATERMARK_PROFILE,
            "media_asset_record_id": SHARED_NATIVE_GALLERY_WATERMARK_ASSET,
            "drive_file_id": SHARED_NATIVE_GALLERY_WATERMARK_DRIVE,
            "sha256": "test-hash",
        }}

    def test_shared_branding_retains_actual_profile(self):
        with patch("rendering_review.profile_watermark.resolve_profile_watermark",
                   return_value=self.source) as resolver:
            result = resolve_native_gallery_watermark(
                client=Catalog(), drive=object(), profile_id=OTHER_PROFILE)
        resolver.assert_called_once()
        self.assertEqual(resolver.call_args.kwargs["profile_id"],
                         SHARED_NATIVE_GALLERY_WATERMARK_PROFILE)
        self.assertEqual(result["receipt"]["profile_id"], OTHER_PROFILE)
        self.assertEqual(result["receipt"]["watermark_owner_profile_id"],
                         SHARED_NATIVE_GALLERY_WATERMARK_PROFILE)
        self.assertEqual(result["receipt"]["branding_policy"],
                         SHARED_NATIVE_GALLERY_POLICY)
        self.assertTrue(result["receipt"]["shared_branding_exception"])

    def test_rejects_any_other_brand_asset(self):
        source = {"bytes": b"test", "receipt": {
            **self.source["receipt"], "media_asset_record_id": OTHER_PROFILE}}
        with patch("rendering_review.profile_watermark.resolve_profile_watermark",
                   return_value=source):
            with self.assertRaises(ProfileWatermarkUnavailable):
                resolve_native_gallery_watermark(
                    client=Catalog(), drive=object(), profile_id=OTHER_PROFILE)

    def test_rejects_unknown_target_profile(self):
        with self.assertRaises(ProfileWatermarkUnavailable):
            resolve_native_gallery_watermark(client=Catalog(), drive=object(),
                                             profile_id="rec99999999999999")

    def test_disabled_policy_delegates_to_exact_profile(self):
        with patch("rendering_review.profile_watermark.resolve_profile_watermark",
                   return_value=self.source) as resolver:
            resolve_native_gallery_watermark(
                client=Catalog(), drive=object(), profile_id=OTHER_PROFILE,
                shared_policy_enabled=False)
        self.assertEqual(resolver.call_args.kwargs["profile_id"], OTHER_PROFILE)


if __name__ == "__main__":
    unittest.main()
