import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.native_gallery_claim_http import create_native_gallery_claim_blueprint


SECRET = "private-pipeline-runner-secret-123456789"
URL = "/jobs/native-gallery/claim-next"


class NativeClaimHttpTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        def claim(**kwargs):
            self.calls.append(kwargs)
            return {"ok": True, "claimed": False, "status": "no_queued_job",
                    "render_started": False, "publication_authorized": False}
        app = Flask(__name__)
        app.register_blueprint(create_native_gallery_claim_blueprint(
            {"pipeline_runner_shared_secret": SECRET},
            client_factory=lambda: "canonical-airtable", claim=claim))
        self.client = app.test_client()

    def test_disabled_does_not_read_airtable(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post(URL, headers={"X-Pipeline-Secret": SECRET})
        self.assertEqual(response.status_code, 405)
        self.assertEqual(self.calls, [])

    def test_service_auth_required_and_no_job_selected_by_body(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true"}):
            wrong = self.client.post(URL, headers={"X-Pipeline-Secret": "wrong"})
            body = self.client.post(URL, headers={"X-Pipeline-Secret": SECRET},
                                    json={"job_id": "user-controlled"})
            self.assertEqual(wrong.status_code, 403)
            self.assertEqual(body.status_code, 400)
            self.assertEqual(self.calls, [])

    def test_on_demand_internal_claim_only_never_renderer(self):
        with patch.dict(os.environ, {
            "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true",
            "NATIVE_GALLERY_WORKER_BASE_URL": "https://worker.example",
            "NATIVE_GALLERY_JOB_SHARED_SECRET": "secret-value",
            "NATIVE_GALLERY_RUNNER_CONSUMER_ID": "runner-1234",
        }):
            response = self.client.post(URL, headers={"X-Pipeline-Secret": SECRET})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["claimed"], False)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.calls[0]["client"], "canonical-airtable")
        self.assertEqual(self.calls[0]["worker_base"], "https://worker.example")
        self.assertFalse(response.get_json()["publication_authorized"])


if __name__ == "__main__":
    unittest.main()
