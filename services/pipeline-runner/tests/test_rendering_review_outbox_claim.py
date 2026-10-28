"""No-network review outbox claim and fail-closed negative contracts."""
import os
import unittest
from unittest.mock import patch

from rendering_review.outbox_claim import (
    REVIEW_JOBS, ReviewOutboxClaimDenied, claim_one_review_job,
    queued_candidates,
)

OUTPUT = "recA1B2C3D4E5F6G7"
JOB = "rrjob_12345678"
ATTEMPT = "rrattempt_12345678"
SESSION = "rrsession_12345678"
SECRET = "rendering-review-internal-secret-example"
ROW = {"id": "recH1J2K3L4M5N6P7", "fields": {
    "Job_ID": JOB, "Session_ID": SESSION,
    "Output_Record_ID": OUTPUT, "Attempt_ID": ATTEMPT,
    "Plan_Hash": "a" * 64, "Job_State": "queued", "Lease_Fence": 0,
}}


class Airtable:
    def __init__(self, rows=None):
        self.rows = [ROW] if rows is None else rows
        self.calls = []

    def list_records(self, table, **kwargs):
        self.calls.append((table, kwargs))
        return self.rows


class OutboxClaimTests(unittest.TestCase):
    def claim(self, client=None, transport=None, **kwargs):
        def send(_url, request, _headers, _timeout):
            return {"ok": True, "lease_verified": True,
                    "output_id": request["output_id"],
                    "job_id": request["job_id"], "session_id": SESSION,
                    "attempt_id": ATTEMPT, "plan_hash": "a" * 64,
                    "lease_owner": "rrrunner_12345678", "lease_fence": 1,
                    "render_started": False, "public_post_created": False}
        with patch.dict(os.environ,
                        {"RENDERING_REVIEW_OUTBOX_CLAIM_ENABLED": "true"}):
            options = {"client": client or Airtable(),
                       "worker_base": "https://studio.example",
                       "shared_secret": SECRET,
                       "consumer_identity": "runner_host_12345",
                       "transport": transport or send}
            options.update(kwargs)
            return claim_one_review_job(**options)

    def test_bounded_read_only_selection(self):
        db = Airtable()
        self.assertEqual(queued_candidates(db)[0]["job_id"], JOB)
        table, opts = db.calls[0]
        self.assertEqual(table, REVIEW_JOBS)
        self.assertEqual(opts["formula"], '{Job_State}="queued"')
        self.assertEqual(opts["max_records"], 3)
        self.assertNotIn("R4", repr(db.calls))
        with self.assertRaisesRegex(ReviewOutboxClaimDenied, "scan_limit"):
            queued_candidates(db, limit=30)

    def test_exact_one_claim_and_deterministic_request_id(self):
        calls = []
        def send(url, body, headers, timeout):
            calls.append((url, body, headers, timeout))
            return {"ok": True, "lease_verified": True,
                    "output_id": OUTPUT, "job_id": JOB,
                    "session_id": SESSION, "attempt_id": ATTEMPT,
                    "plan_hash": "a" * 64, "lease_owner": "rrrunner_12345678",
                    "lease_fence": 1, "render_started": False,
                    "public_post_created": False}
        first = self.claim(transport=send)
        self.assertTrue(first["claimed"])
        self.assertFalse(first["render_started"])
        self.assertFalse(first["public_post_created"])
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0],
                         "https://studio.example/api/internal/rendering-review/claim-render-job")
        self.assertEqual(calls[0][2]["X-Rendering-Review-Job-Secret"], SECRET)
        self.assertEqual(set(calls[0][1]),
                         {"output_id", "job_id", "client_request_id"})
        self.claim(transport=send)
        self.assertEqual(calls[0][1]["client_request_id"],
                         calls[1][1]["client_request_id"])

    def test_empty_queue_never_posts(self):
        self.assertEqual(self.claim(client=Airtable(rows=[]))["status"],
                         "no_queued_job")

    def test_disabled_gate_prevents_even_airtable_read(self):
        db = Airtable()
        with patch.dict(os.environ,
                        {"RENDERING_REVIEW_OUTBOX_CLAIM_ENABLED": "false"}):
            with self.assertRaisesRegex(ReviewOutboxClaimDenied, "disabled"):
                claim_one_review_job(
                    client=db, worker_base="https://studio.example",
                    shared_secret=SECRET, consumer_identity="runner_host_12345",
                )
        self.assertEqual(db.calls, [])

    def test_ambiguous_http_failure_is_one_attempt_not_a_retry(self):
        count = []
        def timeout(*_args):
            count.append(1)
            raise TimeoutError("Worker claimed job but response lost")
        with self.assertRaisesRegex(
            ReviewOutboxClaimDenied, "reconciliation_required"
        ):
            self.claim(transport=timeout)
        self.assertEqual(len(count), 1)

    def test_untrusted_response_denied(self):
        for damaged in (
            {"lease_fence": 0}, {"lease_owner": "invalid"},
            {"render_started": True}, {"public_post_created": True},
            {"plan_hash": "b" * 64}, {"attempt_id": "wrong_attempt"},
            {"lease_verified": False}, {"ok": False},
        ):
            def send(url, body, headers, timeout):
                return {"ok": True, "lease_verified": True,
                        "output_id": OUTPUT, "job_id": JOB,
                        "session_id": SESSION, "attempt_id": ATTEMPT,
                        "plan_hash": "a" * 64, "lease_owner": "rrrunner_12345678",
                        "lease_fence": 1, "render_started": False,
                        "public_post_created": False} | damaged
            with self.subTest(damaged=damaged), self.assertRaisesRegex(
                ReviewOutboxClaimDenied, "receipt_identity_unverified"
            ):
                self.claim(transport=send)

    def test_malformed_queued_record_never_claimed(self):
        for modified in (
            {"Output_Record_ID": "recWrong"},
            {"Job_State": "claimed"},
            {"Lease_Owner": "someone"},
            {"Lease_Fence": 3},
            {"Plan_Hash": "bogus"},
        ):
            fields = {**ROW["fields"], **modified}
            with self.subTest(modified=modified), self.assertRaisesRegex(
                ReviewOutboxClaimDenied, "identity_unverified"
            ):
                self.claim(client=Airtable(rows=[{**ROW, "fields": fields}]))

    def test_unsafe_origin_and_credential_blocked(self):
        with self.assertRaisesRegex(ReviewOutboxClaimDenied, "origin_invalid"):
            self.claim(worker_base="http://evil.example")
        # Invalid secret directly, to avoid supplying a duplicate keyword.
        with patch.dict(os.environ,
                        {"RENDERING_REVIEW_OUTBOX_CLAIM_ENABLED": "true"}):
            with self.assertRaisesRegex(
                ReviewOutboxClaimDenied, "server_identity_unverified"
            ):
                claim_one_review_job(
                    client=Airtable(), worker_base="https://studio.example",
                    shared_secret="short", consumer_identity="runner_host_12345",
                )


if __name__ == "__main__":
    unittest.main()
