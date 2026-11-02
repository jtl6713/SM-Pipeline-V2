import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.gallery_preflight_http import create_native_gallery_preflight_blueprint
from rendering_review.gallery_authoritative import GalleryPreflightDenied

OUTPUT = "rec00000000000001"
PROFILE = "rec00000000000002"
SECRET = "fake-review-runner-shared-secret"
PATH = "/jobs/native-gallery/source-preflight"


def success(**kwargs):
    return dict(
        ok=True, output_id=kwargs["output_id"],
        profile_id=kwargs["expected_profile_id"],
        content_item_id="rec00000000000003",
        slide_count=1, aspect_ratio="4:5",
        sources_byte_verified=True, source_rights_verified=True,
        shared_watermark_asset_verified=True,
        original_artifacts_sha256="a"*64,
        original_artifact_watermark_verified=False,
        can_generate=False, publication_authorized=False,
        blockers=["GALLERY_ORIGINAL_BRANDING_PLACEMENT_NOT_VERIFIED"],
    )


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.called = []
        def verify(**kwargs):
            self.called.append(kwargs)
            return success(**kwargs)
        self.app.register_blueprint(create_native_gallery_preflight_blueprint(
            {"pipeline_runner_shared_secret": SECRET},
            client_factory=lambda: "authoritative-client",
            drive_factory=lambda: "authoritative-drive",
            verifier=verify))
        self.client = self.app.test_client()
        self.body = {"output_id": OUTPUT, "expected_profile_id": PROFILE}
        self.headers = {"X-Pipeline-Secret": SECRET}

    def post(self, body=None, headers=None):
        return self.client.post(PATH, json=self.body if body is None else body,
                                headers=self.headers if headers is None else headers)

    def test_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            result = self.post()
        self.assertEqual(result.status_code, 405)
        self.assertEqual(self.called, [])

    def test_real_service_auth_gate_and_safe_projection(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED": "true"}):
            denied = self.post(headers={"X-Pipeline-Secret": "wrong"})
            self.assertEqual(denied.status_code, 403)
            self.assertEqual(self.called, [])
            result = self.post()
        self.assertEqual(result.status_code, 200)
        data = result.get_json()
        self.assertTrue(data["sources_byte_verified"])
        self.assertFalse(data["can_generate"])
        self.assertFalse(data["publication_authorized"])
        self.assertNotIn("artifacts", data)
        self.assertEqual(data["original_artifacts_sha256"], "a"*64)
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.assertEqual(self.called[0]["client"], "authoritative-client")

    def test_foreign_id_and_extra_fields_rejected(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED": "true"}):
            for payload in (
                {**self.body, "allow_public_publish": True},
                {**self.body, "expected_profile_id": "invalid"},
                {"output_id": OUTPUT},
            ):
                with self.subTest(payload=payload):
                    self.assertEqual(self.post(body=payload).status_code, 400)
        self.assertEqual(self.called, [])

    def test_oversized_payload_cannot_trigger_source_read(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED": "true"}):
            response = self.client.post(
                PATH, data='{"padding":"' + 'x'*900 + '"}',
                headers={**self.headers, "Content-Type": "application/json"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.called, [])

    def test_source_denial_does_not_return_private_bytes(self):
        app = Flask("source-denial-test")
        def denied(**_kwargs):
            raise GalleryPreflightDenied("gallery_source_media_rights_or_profile_denied")
        app.register_blueprint(create_native_gallery_preflight_blueprint(
            {"pipeline_runner_shared_secret": SECRET},
            verifier=denied, client_factory=lambda: object(), drive_factory=lambda: object()))
        with patch.dict(os.environ, {"NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED": "true"}):
            reply = app.test_client().post(PATH, json=self.body, headers=self.headers)
        self.assertEqual(reply.status_code, 409)
        self.assertFalse(reply.get_json()["can_generate"])


if __name__ == "__main__":
    unittest.main()
