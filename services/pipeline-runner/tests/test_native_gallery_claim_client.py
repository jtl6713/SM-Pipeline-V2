import os
import unittest
from unittest.mock import patch

from rendering_review.native_gallery_claim_client import (
    candidates, claim_one_native_gallery_job, NativeGalleryClaimDenied, JOBS,
)

OUT="rec00000000000001"
JOB="ngjob_12345678901234567890"
SEC="runner-native-gallery-service-secret-123456"


def row():
    return {"id": "rec00000000000006", "fields": {
        "Job_ID": JOB, "Output_Record_ID": OUT,
        "Content_Item_Record_ID": "rec00000000000002",
        "Profile_Record_ID": "rec00000000000003",
        "Actor_Record_ID": "rec00000000000004",
        "Job_State": "held_queued",
        "Original_Manifest_SHA256": "a"*64,
        "Plan_SHA256": "b"*64,
        "Hold_ID": "gallery_hold_123456",
        "Hold_Owner": "gallery_owner_123456",
        "Lease_Owner": "", "Lease_Fence": 0,
        "Row_Version": 1,
    }}


class Client:
    def __init__(self, data=None):
        self.data = [row()] if data is None else data
    def list_records(self, table, *, formula, max_records, fields):
        assert table == JOBS
        assert max_records == 3
        assert "held_queued" in formula
        return self.data


def call(client=None, transport=None):
    return claim_one_native_gallery_job(
        client=client or Client(),
        worker_base="https://worker.example", shared_secret=SEC,
        consumer_identity="runner-123456789",
        transport=transport,
    )


class NativeGalleryClaimTests(unittest.TestCase):
    def test_queued_candidates_only_from_native_table(self):
        self.assertEqual(candidates(Client()), [{"job_id": JOB, "output_id": OUT}])

    def test_service_flag_off_has_no_contact(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(NativeGalleryClaimDenied, "disabled"):
                call()

    def test_exact_one_post_no_render(self):
        calls = []
        def sender(url, body, headers, timeout):
            calls.append((url, body, headers, timeout))
            return {"ok": True, "job_id": JOB, "output_id": OUT,
                    "lease_verified": True, "lease_owner": "ngrunner_123456",
                    "lease_fence": 1, "render_started": False,
                    "publication_authorized": False}
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true"}):
            result = call(transport=sender)
        self.assertTrue(result["claimed"])
        self.assertFalse(result["publication_authorized"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0],
                         "https://worker.example/api/internal/native-gallery/claim-job")
        self.assertEqual(calls[0][2]["X-Native-Gallery-Job-Secret"], SEC)

    def test_ambiguous_timeout_never_second_post(self):
        calls = []
        def sender(*args):
            calls.append(args)
            raise TimeoutError()
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true"}):
            with self.assertRaisesRegex(NativeGalleryClaimDenied, "reconciliation"):
                call(transport=sender)
        self.assertEqual(len(calls), 1)

    def test_wrong_output_or_publication_receipt_rejected(self):
        for changed in ({"output_id": "rec99999999999999"},
                        {"publication_authorized": True},
                        {"render_started": True}):
            def sender(*args):
                return {"ok": True, "job_id": JOB, "output_id": OUT,
                        "lease_verified": True, "lease_owner": "ngrunner_123456",
                        "lease_fence": 1, "render_started": False,
                        "publication_authorized": False, **changed}
            with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_CLAIM_ENABLED": "true"}):
                with self.assertRaises(NativeGalleryClaimDenied):
                    call(transport=sender)

    def test_candidate_forged_claim_denied(self):
        copy = row()
        copy["fields"]["Profile_Record_ID"] = "wrong"
        with self.assertRaises(NativeGalleryClaimDenied):
            candidates(Client([copy]))


if __name__ == "__main__":
    unittest.main()
