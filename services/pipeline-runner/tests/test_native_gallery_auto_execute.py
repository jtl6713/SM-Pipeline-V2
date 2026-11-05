import os
import unittest
from unittest.mock import patch

import rendering_review.native_gallery_auto_execute as dispatch
from rendering_review.native_gallery_staging_settings import NativeGalleryStagingDenied


def verified_rights(_settings):
    def approve(**_):
        return {"approved": True}
    approve.preferred_account = "PRIMARY"
    return approve


class AutoDispatchTests(unittest.TestCase):
    def setUp(self):
        mock = patch("rendering_review.native_gallery_auto_execute.resolve_private_native_gallery_staging_folder",
                     return_value="1VdULNl85JDoL_EaurRKMPm0tRi8xOawH")
        mock.start()
        self.addCleanup(mock.stop)

    def test_disabled_does_not_claim(self):
        called = []
        with patch.dict(os.environ, {}, clear=True):
            result = dispatch.sweep_once({}, executor=lambda **_:
                                         called.append(True),
                                         rights_factory=verified_rights)
        self.assertEqual(result["status"], "disabled")
        self.assertEqual(called, [])

    def test_at_most_one_job_and_never_publishes(self):
        calls = []
        def executor(**kwargs):
            calls.append(kwargs)
            return {"ok": True, "claimed": True, "job_id": "ngjob_abc",
                    "publication_authorized": False}
        flags = {"NATIVE_GALLERY_AUTO_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}
        with patch.dict(os.environ, flags, clear=True):
            out = dispatch.sweep_once({}, client=object(), drive=object(),
                                      executor=executor,
                                      rights_factory=verified_rights)
        self.assertEqual(out["job_id"], "ngjob_abc")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["staging_folder_id"], "1VdULNl85JDoL_EaurRKMPm0tRi8xOawH")
        self.assertTrue(callable(calls[0]["generator"]))
        self.assertFalse(out["publication_authorized"])

    def test_missing_staging_never_claims(self):
        flags = {"NATIVE_GALLERY_AUTO_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}
        called = []
        with patch.dict(os.environ, flags, clear=True), patch(
            "rendering_review.native_gallery_auto_execute.resolve_private_native_gallery_staging_folder",
            side_effect=NativeGalleryStagingDenied("inactive")):
            with self.assertRaises(NativeGalleryStagingDenied):
                dispatch.sweep_once({}, client=object(), drive=object(),
                                    executor=lambda **_: called.append(True),
                                    rights_factory=verified_rights)
        self.assertEqual(called, [])

    def test_fail_closed_on_missing_rights_provider(self):
        flags = {"NATIVE_GALLERY_AUTO_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true",
                 "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}
        called = []
        with patch.dict(os.environ, flags, clear=True):
            with self.assertRaisesRegex(RuntimeError, "provider_pin"):
                dispatch.sweep_once({}, client=object(), drive=object(),
                    executor=lambda **_: called.append(True),
                    rights_factory=lambda _: (lambda **__: True))
        self.assertEqual(called, [])


if __name__ == "__main__":
    unittest.main()
