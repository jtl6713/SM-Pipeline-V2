"""Hermetic Chicago IG shared-ownership claim tests; never call Worker or Graph."""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from publish.review_dispatch_claim import (
    ReviewDispatchClaimError, is_chicago_reel,
    claim_chicago_dispatch, shared_dispatch_claim_required,
)

OUTPUT_ID = "recA1B2C3D4E5F6G7"
CONTENT_ID = "recQ1W2E3R4T5Y6U7"
CHICAGO = "recT2rbKX3MF7cVFU"
SECRET = "sufficiently-long-claim-secret-123456789"
OUTPUT = {
    "id": OUTPUT_ID,
    "fields": {
        "Platform": "Instagram",
        "Platform_Output_Type": "Instagram Reel",
        "Content_Item": [CONTENT_ID],
        "Publish_Asset_URL": "https://media.test/video.mp4",
        "Final_File_ID": "drive-master-123",
    },
}


class Client:
    def __init__(self, profile=CHICAGO):
        self.profile = profile

    def get_record(self, table, rec_id):
        assert table == "tblwzN9AXWvmKVKPs"
        assert rec_id == CONTENT_ID
        return {"id": CONTENT_ID, "fields": {"Content_Profile": [self.profile]}}


class ClaimTests(unittest.TestCase):
    def test_feature_off_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(shared_dispatch_claim_required())

    def test_exact_pilot_output_is_the_only_claimed_chicago_reel(self):
        with patch.dict(os.environ, {
            "RENDERING_REVIEW_IG_DISPATCH_CLAIM_REQUIRED": "true",
            "RENDERING_REVIEW_EXACT_OUTPUT_ID": OUTPUT_ID,
        }, clear=True):
            self.assertTrue(shared_dispatch_claim_required(OUTPUT_ID))
            self.assertFalse(shared_dispatch_claim_required("recB1B2B3B4B5B6B7"))
            with self.assertRaisesRegex(ReviewDispatchClaimError, "identity_missing"):
                shared_dispatch_claim_required(None)
        with patch.dict(os.environ, {
            "RENDERING_REVIEW_IG_DISPATCH_CLAIM_REQUIRED": "true",
        }, clear=True):
            with self.assertRaisesRegex(ReviewDispatchClaimError, "scope_missing"):
                shared_dispatch_claim_required(OUTPUT_ID)

    def test_chicago_scope_uses_exact_linked_content_profile(self):
        self.assertTrue(is_chicago_reel(Client(), OUTPUT))
        self.assertFalse(is_chicago_reel(Client("recO1T2H3E4R5P6R7"), OUTPUT))
        bad = {**OUTPUT, "fields": {**OUTPUT["fields"], "Content_Item": []}}
        with self.assertRaisesRegex(ReviewDispatchClaimError, "content_identity"):
            is_chicago_reel(Client(), bad)

    def test_missing_endpoint_secret_fails_closed(self):
        with patch.dict(os.environ, {"STUDIO_RENDER_REVIEW_WORKER_URL": "https://studio.test"},
                        clear=True):
            with self.assertRaisesRegex(ReviewDispatchClaimError, "unconfigured"):
                claim_chicago_dispatch(OUTPUT)

    def test_valid_internal_claim_receipt(self):
        with patch.dict(os.environ, {
            "STUDIO_RENDER_REVIEW_WORKER_URL": "https://studio.test",
            "RENDERING_REVIEW_DISPATCH_SHARED_SECRET": SECRET,
        }, clear=True):
            def transport(body, headers):
                self.assertEqual(body["output_id"], OUTPUT_ID)
                self.assertEqual(body["expected_final_file_id"], "drive-master-123")
                self.assertEqual(body["expected_publish_asset_url"], "https://media.test/video.mp4")
                self.assertEqual(headers["X-Review-Dispatch-Token"], SECRET)
                return {
                    "ok": True,
                    "output_id": OUTPUT_ID,
                    "owner": "AP1-IG",
                    "claim_id": body["client_request_id"],
                    "publish_started_at": "2026-10-28T15:00:00.000Z",
                    "review_hold_active": False,
                    "remote_media_created": False,
                }
            result = claim_chicago_dispatch(OUTPUT, post=transport)
            self.assertTrue(result["ok"])

    def test_wrong_owner_wrong_request_and_remote_media_are_denied(self):
        with patch.dict(os.environ, {
            "STUDIO_RENDER_REVIEW_WORKER_URL": "https://studio.test",
            "RENDERING_REVIEW_DISPATCH_SHARED_SECRET": SECRET,
        }, clear=True):
            for response in [
                {"ok": True, "owner": "other"},
                {"ok": True, "owner": "AP1-IG", "claim_id": "wrong"},
                {"ok": True, "remote_media_created": True},
            ]:
                with self.subTest(response=response):
                    with self.assertRaisesRegex(ReviewDispatchClaimError, "bad_receipt"):
                        claim_chicago_dispatch(OUTPUT, post=lambda _body, _hdr: response)

    def test_timeout_is_not_a_permission_to_create_graph_container(self):
        with patch.dict(os.environ, {
            "STUDIO_RENDER_REVIEW_WORKER_URL": "https://studio.test",
            "RENDERING_REVIEW_DISPATCH_SHARED_SECRET": SECRET,
        }, clear=True):
            def timeout(_body, _hdr):
                raise TimeoutError("Worker response lost after claim")
            with self.assertRaisesRegex(ReviewDispatchClaimError, "unverified"):
                claim_chicago_dispatch(OUTPUT, post=timeout)

    def test_processor_claim_is_before_python_lock_patch_and_graph_creation(self):
        processor = (Path(__file__).resolve().parents[1] / "ap1_ig" / "processor.py").read_text()
        claim_at = processor.index("claim_chicago_dispatch(output)")
        patch_at = processor.index("client.update_record(\n        PLATFORM_OUTPUTS_TABLE,\n        output[\"id\"],", claim_at)
        graph_at = processor.index("graph.create_reel(body)", claim_at)
        self.assertLess(claim_at, patch_at)
        self.assertLess(patch_at, graph_at)


if __name__ == "__main__":
    unittest.main()
