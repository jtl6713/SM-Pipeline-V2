import os
import unittest
from unittest.mock import patch

from flask import Flask
from rendering_review.native_gallery_launch_http import create_native_gallery_launch_blueprint

OUT = "rec00000000000001"
JOB = "ngjob_12345678901234567890"
LEASE = "ngrunner_12345678901234567890"
SECRET = "test-private-gallery-pipeline-secret-123456789"
PATH = "/jobs/native-gallery/reserve-launch"
BODY = {"output_id": OUT, "job_id": JOB,
        "lease_owner": LEASE, "lease_fence": 1}


class LaunchHttpTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        app = Flask(__name__)
        def reserve(**kwargs):
            self.calls.append(kwargs)
            return {"ok": True, "job_id": JOB, "output_id": OUT,
                    "intent_reserved": True, "may_generate": True,
                    "publication_authorized": False}
        app.register_blueprint(create_native_gallery_launch_blueprint(
            {"pipeline_runner_shared_secret": SECRET},
            client_factory=lambda: "source-client", reserve=reserve))
        self.client = app.test_client()
        self.headers = {"X-Pipeline-Secret": SECRET}

    def post(self, payload=BODY, headers=None):
        return self.client.post(PATH, json=payload,
                                headers=self.headers if headers is None else headers)

    def test_flag_off_and_unauthorized_block_before_airtable(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.post().status_code, 405)
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED":"true"}):
            self.assertEqual(self.post(headers={"X-Pipeline-Secret":"wrong"}).status_code,403)
        self.assertEqual(self.calls, [])

    def test_exact_private_lease_only_no_generator_and_no_publish(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED":"true"}):
            reply = self.post()
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.get_json()["publication_authorized"], False)
        self.assertEqual(reply.get_json()["render_started"], False)
        self.assertEqual(reply.headers["Cache-Control"], "no-store")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0]["claim_receipt"]["lease_owner"], LEASE)

    def test_reject_extra_publish_fields_and_malformed_lease(self):
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED":"true"}):
            for value in (
                {**BODY, "allow_public_publish": True},
                {**BODY, "lease_owner": "invalid"},
                {**BODY, "lease_fence": 0},
                {**BODY, "lease_fence": True},
            ):
                with self.subTest(value=value):
                    self.assertEqual(self.post(payload=value).status_code, 400)
            oversized=self.client.post(PATH,
                data='{"untrusted":"'+"x"*800+'"}',
                headers={**self.headers,"Content-Type":"application/json"})
            self.assertEqual(oversized.status_code, 413)
        self.assertEqual(len(self.calls), 0)


if __name__ == "__main__":
    unittest.main()
