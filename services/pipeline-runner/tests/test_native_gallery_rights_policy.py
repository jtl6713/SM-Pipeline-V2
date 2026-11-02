import os
import unittest
from unittest.mock import patch

from rendering_review.native_gallery_rights_policy import (
    NativeGalleryRightsPolicyDenied, build_approved_native_gallery_clearance,
)
from carousel.constants import OPENAI_IMAGE_MODEL

ENV = {
    "NATIVE_GALLERY_RIGHTS_REVIEWED": "true",
    "NATIVE_GALLERY_RIGHTS_APPROVED_PROVIDER": "openai",
    "NATIVE_GALLERY_RIGHTS_APPROVED_MODEL": OPENAI_IMAGE_MODEL,
    "NATIVE_GALLERY_RIGHTS_POLICY_BASIS": "Approved commercial image usage",
    "NATIVE_GALLERY_RIGHTS_REVIEWER": "legal-reviewer",
    "NATIVE_GALLERY_RIGHTS_POLICY_URL": "https://example.com/reviewed-rights",
}


class RightsPolicyTests(unittest.TestCase):
    def test_no_policy_denies_before_job_claim(self):
        with patch("rendering_review.native_gallery_rights_policy.cross_provider_failover_enabled",
                   return_value=False), patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(NativeGalleryRightsPolicyDenied):
                build_approved_native_gallery_clearance({})

    def test_unreviewed_or_mismatched_provider_denied(self):
        with patch("rendering_review.native_gallery_rights_policy.cross_provider_failover_enabled",
                   return_value=False), patch("rendering_review.native_gallery_rights_policy.get_preferred_account",
                   return_value="PRIMARY"), patch(
                       "rendering_review.native_gallery_rights_policy.account_to_provider",
                       return_value="openai"):
            for update in ({"NATIVE_GALLERY_RIGHTS_REVIEWED": "false"},
                           {"NATIVE_GALLERY_RIGHTS_APPROVED_MODEL": "wrong-model"},
                           {"NATIVE_GALLERY_RIGHTS_APPROVED_PROVIDER": "azure"}):
                with self.subTest(update=update), patch.dict(os.environ,
                    {**ENV, **update}, clear=True):
                    with self.assertRaises(NativeGalleryRightsPolicyDenied):
                        build_approved_native_gallery_clearance({})

    def test_failover_must_be_disabled_before_generation(self):
        with patch("rendering_review.native_gallery_rights_policy.cross_provider_failover_enabled",
                   return_value=True), patch.dict(os.environ, ENV, clear=True):
            with self.assertRaises(NativeGalleryRightsPolicyDenied):
                build_approved_native_gallery_clearance({})

    def test_approved_policy_only_attests_exact_server_generated_image(self):
        with patch("rendering_review.native_gallery_rights_policy.cross_provider_failover_enabled",
                   return_value=False), patch(
                       "rendering_review.native_gallery_rights_policy.get_preferred_account",
                       return_value="PRIMARY"), patch(
                       "rendering_review.native_gallery_rights_policy.account_to_provider",
                       return_value="openai"), patch.dict(os.environ, ENV, clear=True):
            approve = build_approved_native_gallery_clearance({})
            self.assertFalse(approve()["approved"])
            decision = approve(output_id="output", profile_id="profile",
               content_item_id="content", job_id="job", slot_id="slide",
               file_id="file", sha256="a"*64)
            self.assertTrue(decision["approved"])
            self.assertIn("reviewer", decision["rights_basis"])


if __name__ == "__main__":
    unittest.main()
