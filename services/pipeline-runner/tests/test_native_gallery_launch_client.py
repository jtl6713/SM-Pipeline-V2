import copy
import os
import unittest
from unittest.mock import patch
from rendering_review.native_gallery_launch_client import (
    NativeGalleryLaunchDenied, reserve_native_gallery_launch, JOBS,
)

OUT = "rec00000000000001"
JOB = "ngjob_12345678901234567890"
LEASE = "ngrunner_12345678901234567890"
SEC = "private-native-gallery-runner-service-secret-001"
CLAIM = {"output_id": OUT, "job_id": JOB, "lease_owner": LEASE,
         "lease_fence": 1, "lease_verified": True,
         "render_started": False, "publication_authorized": False}


def row():
    return {"id": "rec00000000000005", "fields": {
        "Job_ID": JOB, "Output_Record_ID": OUT,
        "Profile_Record_ID": "rec00000000000002",
        "Content_Item_Record_ID": "rec00000000000003",
        "Plan_SHA256": "a"*64, "Original_Manifest_SHA256": "b"*64,
        "Job_State": "claimed", "Lease_Owner": LEASE,
        "Lease_Fence": 1, "Row_Version": 2,
        "Event_History_JSON": (
            '[{"event":"native_gallery_job_created","publication_authorized":false},'
            '{"event":"native_gallery_job_claimed","lease_owner":"' + LEASE +
            '","lease_fence":1,"publication_authorized":false}]'),
    }}


class Client:
    def __init__(self):
        self.row = row()
        self.reads = 0
    def list_records(self, table, *, formula, max_records, fields):
        assert table == JOBS
        assert JOB in formula
        assert max_records == 2
        self.reads += 1
        return [copy.deepcopy(self.row)]


class LaunchTests(unittest.TestCase):
    def test_one_exact_reserved_launch_and_no_public_authority(self):
        client = Client()
        calls = []
        def send(url, body, headers, timeout):
            calls.append((url, body, headers, timeout))
            return {"ok": True, "intent_verified": True, "replay": False,
                    "may_generate": True, "publication_authorized": False,
                    "output_id": OUT, "job_id": JOB,
                    "lease_owner": LEASE, "lease_fence": 1}
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}):
            result = reserve_native_gallery_launch(
                client=client, worker_base="https://worker.example",
                shared_secret=SEC, claim_receipt=CLAIM, transport=send)
        self.assertTrue(result["intent_reserved"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0],
            "https://worker.example/api/internal/native-gallery/reserve-launch")
        self.assertEqual(calls[0][1]["action"], "reserve_intent")
        self.assertEqual(calls[0][2]["X-Native-Gallery-Job-Secret"], SEC)
        self.assertEqual(len(calls[0][1]["payload_hash"]), 64)
        self.assertFalse(result["publication_authorized"])

    def test_disabled_never_reads_airtable_or_posts(self):
        c = Client()
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(NativeGalleryLaunchDenied, "disabled"):
                reserve_native_gallery_launch(
                    client=c, worker_base="https://worker.example",
                    shared_secret=SEC, claim_receipt=CLAIM)
        self.assertEqual(c.reads, 0)

    def test_ambiguous_http_must_reconcile_not_repost(self):
        calls = []
        def timeout(*args):
            calls.append(args)
            raise TimeoutError()
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}):
            with self.assertRaisesRegex(NativeGalleryLaunchDenied, "reconciliation"):
                reserve_native_gallery_launch(
                    client=Client(), worker_base="https://worker.example",
                    shared_secret=SEC, claim_receipt=CLAIM, transport=timeout)
        self.assertEqual(len(calls), 1)

    def test_reserved_intent_blocks_any_second_post(self):
        c = Client()
        c.row["fields"]["Launch_Intent_SHA256"] = "c"*64
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}):
            with self.assertRaisesRegex(NativeGalleryLaunchDenied, "reconcile"):
                reserve_native_gallery_launch(
                    client=c, worker_base="https://worker.example",
                    shared_secret=SEC, claim_receipt=CLAIM,
                    transport=lambda *args: self.fail("unexpected POST"))

    def test_stale_lease_and_public_reply_denied(self):
        for update in (
            {"Lease_Owner": "different_runner_123456"},
            {"Job_State": "queued"}, {"Row_Version": 3},
            {"Plan_SHA256": "invalid"}, {"Lease_Fence": 2},
        ):
            c = Client()
            c.row["fields"].update(update)
            with self.subTest(update=update):
                with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}):
                    with self.assertRaises(NativeGalleryLaunchDenied):
                        reserve_native_gallery_launch(
                            client=c, worker_base="https://worker.example",
                            shared_secret=SEC, claim_receipt=CLAIM,
                            transport=lambda *args: self.fail("unexpected POST"))
        with patch.dict(os.environ, {"NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED": "true"}):
            with self.assertRaisesRegex(NativeGalleryLaunchDenied, "receipt_unverified"):
                reserve_native_gallery_launch(
                    client=Client(), worker_base="https://worker.example",
                    shared_secret=SEC, claim_receipt=CLAIM,
                    transport=lambda *args: {
                        "ok": True, "intent_verified": True, "replay": False,
                        "may_generate": True, "publication_authorized": True,
                        "output_id": OUT, "job_id": JOB,
                        "lease_owner": LEASE, "lease_fence": 1})


if __name__ == "__main__":
    unittest.main()
