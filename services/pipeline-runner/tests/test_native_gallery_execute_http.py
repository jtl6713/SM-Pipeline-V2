import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.native_gallery_execute_http import (
    create_native_gallery_execute_blueprint,
)
from rendering_review.native_gallery_rights_policy import NativeGalleryRightsPolicyDenied
from rendering_review.native_gallery_staging_settings import NativeGalleryStagingDenied

SECRET = "runner-native-gallery-secret-123456789"


class ExecuteHttpTests(unittest.TestCase):
    def setUp(self):
        mock = patch(
            "rendering_review.native_gallery_execute_http.resolve_private_native_gallery_staging_folder",
            return_value="1VdULNl85JDoL_EaurRKMPm0tRi8xOawH")
        mock.start()
        self.addCleanup(mock.stop)

    def make_client(self, *, executed=None, policy=None):
        app = Flask(__name__)
        app.register_blueprint(create_native_gallery_execute_blueprint(
            {"pipeline_runner_shared_secret": SECRET},
            client_factory=lambda: object(), drive_factory=lambda: object(),
            executor=executed or (lambda **_: {
                "ok": True, "claimed": False, "publication_authorized": False}),
            rights_policy_factory=policy or (
                lambda _: (lambda **__: {"approved": True})),
        ))
        return app.test_client()

    def test_disabled_requires_no_side_effect(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "false"}):
            self.assertEqual(self.make_client().post(
                "/jobs/native-gallery/execute-next").status_code, 405)

    def test_auth_and_user_selected_input_denied(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true"}):
            client = self.make_client()
            endpoint = "/jobs/native-gallery/execute-next"
            self.assertEqual(client.post(endpoint).status_code, 403)
            self.assertEqual(client.post(endpoint + "?output_id=rec00000000000001",
                                         headers={"X-Pipeline-Secret": SECRET}).status_code, 400)
            self.assertEqual(client.post(endpoint,
                                         data='{"job_id":"untrusted"}',
                                         headers={"X-Pipeline-Secret": SECRET}).status_code, 400)

    def test_unreviewed_rights_policy_blocks_claim(self):
        invoked = []
        def executor(**_):
            invoked.append(True)
        def denied_policy(_):
            raise NativeGalleryRightsPolicyDenied("policy_missing")
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true"}):
            client = self.make_client(executed=executor, policy=denied_policy)
            result = client.post("/jobs/native-gallery/execute-next",
                                 headers={"X-Pipeline-Secret": SECRET})
            self.assertEqual(result.status_code, 503)
        self.assertEqual(invoked, [])

    def test_missing_staging_denies_before_executor_claim(self):
        invoked = []
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true"}), patch(
            "rendering_review.native_gallery_execute_http.resolve_private_native_gallery_staging_folder",
            side_effect=NativeGalleryStagingDenied("inactive")):
            client = self.make_client(executed=lambda **_: invoked.append(True))
            res = client.post("/jobs/native-gallery/execute-next",
                              headers={"X-Pipeline-Secret": SECRET})
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json["error"], "native_gallery_staging_not_ready")
        self.assertEqual(invoked, [])

    def test_only_non_publishing_receipt_returns_success(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED": "true"}):
            c = self.make_client()
            res = c.post("/jobs/native-gallery/execute-next",
                         headers={"X-Pipeline-Secret": SECRET})
            self.assertEqual(res.status_code, 200)
            self.assertFalse(res.json["publication_authorized"])
            self.assertEqual(res.headers["Cache-Control"], "no-store")
            publishing = self.make_client(executed=lambda **_: {
                "ok": True, "publication_authorized": True})
            res = publishing.post("/jobs/native-gallery/execute-next",
                                  headers={"X-Pipeline-Secret": SECRET})
            self.assertEqual(res.status_code, 503)


if __name__ == "__main__":
    unittest.main()
