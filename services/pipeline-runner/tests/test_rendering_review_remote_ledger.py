"""Hermetic protected Worker launch-ledger bridge contracts."""
import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from rendering_review.remote_ledger import RemoteLaunchLedger, ReviewLedgerUnavailable, review_setting

CLAIM={
    "ok":True,"lease_verified":True,"output_id":"recA1B2C3D4E5F6G7",
    "job_id":"rrjob_12345678","session_id":"rrsession_12345678",
    "attempt_id":"rrattempt_12345678","plan_hash":"a"*64,
    "lease_owner":"rrrunner_12345678","lease_fence":1,
}
SECRET="separate-render-worker-protected-secret-long"


class LedgerTests(unittest.TestCase):
    def make(self, transport=None, claim=None, origin="https://studio.example"):
        calls=[]
        def send(url,body,headers,timeout):
            calls.append((url,body,headers,timeout))
            return {"verified":True,"job_id":body["job_id"],
                    "lease_fence":body["lease_fence"]}
        ledger=RemoteLaunchLedger(worker_base=origin,shared_secret=SECRET,
                                  claim=claim or CLAIM,transport=transport or send)
        return ledger,calls

    def test_exact_job_and_fence_are_not_overridable(self):
        ledger,calls=self.make()
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"wrong_job"):
            ledger.read_authority("different-job")
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"stale_fence"):
            ledger.reserve_launch_intent(CLAIM["job_id"],2,"b"*64)
        self.assertEqual(len(calls),0)

    def test_correct_sequential_actions_include_exact_immutable_lease(self):
        ledger,calls=self.make()
        job=CLAIM["job_id"]
        ledger.read_authority(job)
        ledger.reserve_launch_intent(job,1,"b"*64)
        ledger.read_launch_intent(job)
        ledger.persist_launch_receipt(job,1,"b"*64,"remotion_12345678",
                                      "https://renderer.example/status/remotion_12345678")
        ledger.read_launch_receipt(job)
        self.assertEqual([x[1]["action"] for x in calls],
                         ["read_authority","reserve_intent","read_intent",
                          "persist_receipt","read_receipt"])
        self.assertTrue(all(x[0]=="https://studio.example/api/internal/rendering-review/launch-ledger"
                            for x in calls))
        self.assertTrue(all(x[1]["job_id"]==job and x[1]["lease_owner"]==CLAIM["lease_owner"]
                            for x in calls))
        self.assertTrue(all(x[2]["X-Rendering-Review-Job-Secret"]==SECRET for x in calls))

    def test_error_during_reservation_is_ambiguous_and_never_retried(self):
        attempts=[]
        def fail(url,body,headers,timeout):
            attempts.append(body)
            raise TimeoutError("response lost after durable ledger write")
        ledger,_=self.make(transport=fail)
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"no_retry"):
            ledger.reserve_launch_intent(CLAIM["job_id"],1,"b"*64)
        self.assertEqual(len(attempts),1)

    def test_requires_https_origin_and_trusted_server_claim(self):
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"origin_invalid"):
            self.make(origin="http://studio.example")
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"origin_invalid"):
            self.make(origin="https://studio.example/redirect")
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"trusted_render_claim"):
            self.make(claim={**CLAIM,"lease_verified":False})
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"trusted_render_claim"):
            self.make(claim={**CLAIM,"lease_fence":0})

    def test_access_service_token_adds_headers_without_replacing_job_secret(self):
        with patch.dict(os.environ, {
            "CF_ACCESS_CLIENT_ID": "review-pilot-service",
            "CF_ACCESS_CLIENT_SECRET": "private-token-value",
        }):
            ledger,calls=self.make()
            ledger.read_authority(CLAIM["job_id"])
        headers=calls[0][2]
        self.assertEqual(headers["CF-Access-Client-Id"],"review-pilot-service")
        self.assertEqual(headers["CF-Access-Client-Secret"],"private-token-value")
        self.assertEqual(headers["X-Rendering-Review-Job-Secret"],SECRET)

    def test_partial_access_service_token_never_sends_an_unprotected_request(self):
        sent=[]
        with patch.dict(os.environ, {
            "CF_ACCESS_CLIENT_ID": "review-pilot-service",
            "CF_ACCESS_CLIENT_SECRET": "",
        }):
            ledger,_=self.make(transport=lambda *a:sent.append(a))
            with self.assertRaisesRegex(ReviewLedgerUnavailable,"no_retry"):
                ledger.read_authority(CLAIM["job_id"])
        self.assertEqual(sent,[])

    def test_protected_ops_env_overrides_stale_process_review_credentials(self):
        # The protected Ops activation writes a matched Cloudflare Access
        # identity and job credential to the local Runner .env. No value is
        # logged or returned over HTTP; a stale Windows process env must not
        # override the new matched source.
        with tempfile.TemporaryDirectory() as d:
            cfg=Path(d)/".env"
            cfg.write_text("CF_ACCESS_CLIENT_ID=fresh-client\n"
                           "CF_ACCESS_CLIENT_SECRET=fresh-secret\n"
                           "RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET=fresh-review-job-secret-long\n"
                           "RENDERING_REVIEW_WORKER_BASE_URL=https://studio.chicagoshining.com\n")
            with patch("rendering_review.remote_ledger._review_env_path",return_value=cfg), \
                 patch.dict(os.environ, {
                   "CF_ACCESS_CLIENT_ID":"old-client",
                   "CF_ACCESS_CLIENT_SECRET":"old-secret",
                   "RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET":"old-job-secret",
                   "RENDERING_REVIEW_WORKER_BASE_URL":"https://old.example",
                 }):
                self.assertEqual(review_setting("RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET"),
                                 "fresh-review-job-secret-long")
                self.assertEqual(review_setting("RENDERING_REVIEW_WORKER_BASE_URL"),
                                 "https://studio.chicagoshining.com")
                ledger,calls=self.make()
                ledger.read_authority(CLAIM["job_id"])
                self.assertEqual(calls[0][2]["CF-Access-Client-Id"],"fresh-client")
                self.assertEqual(calls[0][2]["CF-Access-Client-Secret"],"fresh-secret")
                self.assertEqual(calls[0][2]["X-Rendering-Review-Job-Secret"],SECRET)

    def test_existing_ops_file_missing_key_fails_closed_without_stale_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            cfg=Path(d)/".env"
            cfg.write_text("CF_ACCESS_CLIENT_ID=present\nCF_ACCESS_CLIENT_SECRET=\n")
            with patch("rendering_review.remote_ledger._review_env_path",return_value=cfg), \
                 patch.dict(os.environ, {"CF_ACCESS_CLIENT_ID":"stale-id",
                                         "CF_ACCESS_CLIENT_SECRET":"stale-secret"}):
                sent=[]
                ledger,_=self.make(transport=lambda *args:sent.append(args))
                with self.assertRaisesRegex(ReviewLedgerUnavailable,"no_retry"):
                    ledger.read_authority(CLAIM["job_id"])
                self.assertEqual(sent,[])

    def test_invalid_server_response_denies_without_guessing(self):
        ledger,_=self.make(transport=lambda *_:None)
        with self.assertRaisesRegex(ReviewLedgerUnavailable,"response_unverified"):
            ledger.read_launch_receipt(CLAIM["job_id"])


if __name__=="__main__":
    unittest.main()
