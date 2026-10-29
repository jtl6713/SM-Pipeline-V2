"""Offline regressions for Cloudflare Worker HTTP transports; no real calls."""
import io
import json
import unittest
from unittest.mock import patch

import requests
from rendering_review.one_job import _post_once, ExactReviewRenderDenied
from rendering_review.remote_ledger import RemoteLaunchLedger, ReviewLedgerUnavailable


class Raw:
    def __init__(self, data):
        self.reader=io.BytesIO(data)
    def read(self,size,decode_content=False):
        return self.reader.read(size)


class Response:
    def __init__(self, code, body):
        self.status_code=code
        self.raw=Raw(body if isinstance(body,bytes) else json.dumps(body).encode())
    def __enter__(self):
        return self
    def __exit__(self,*_):
        return False


class HttpTransportTests(unittest.TestCase):
    def test_one_worker_post_is_bounded_and_disables_redirects_and_retries(self):
        seen=[]
        def post(url,**kw):
            seen.append((url,kw))
            return Response(200,{"ok":True,"lease_verified":True})
        with patch("rendering_review.one_job.requests.post",side_effect=post):
            with patch("rendering_review.one_job._access_headers",return_value={}):
                response=_post_once("https://studio.chicagoshining.com","s"*32,
                         "/api/internal/rendering-review/claim-render-job",{"output_id":"not_real"})
        self.assertTrue(response["lease_verified"])
        self.assertEqual(len(seen),1)
        self.assertFalse(seen[0][1]["allow_redirects"])
        self.assertTrue(seen[0][1]["stream"])
        self.assertEqual(seen[0][1]["headers"]["User-Agent"],"")
        self.assertIn("X-Rendering-Review-Job-Secret",seen[0][1]["headers"])

    def test_worker_denials_never_retry_and_include_only_safe_error_code(self):
        for status,body,expected in [
            (403,{"code":"RENDER_AUTH_DENIED","error":"untrusted content"},
                "review_worker_http_denied_403_render_auth_denied"),
            (403,b"<html>Unrelated HTML</html>","review_worker_http_denied_403"),
            (302,{"ok":False},"review_worker_reply_ambiguous_reconcile"),
        ]:
            with self.subTest(status=status,body=body):
                with patch("rendering_review.one_job.requests.post",
                           return_value=Response(status,body)) as mockpost:
                    with patch("rendering_review.one_job._access_headers",return_value={}):
                        with self.assertRaises(ExactReviewRenderDenied) as e:
                            _post_once("https://studio.chicagoshining.com","s"*32,
                                "/api/internal/rendering-review/claim-render-job",{})
                        self.assertIn(expected,str(e.exception))
                        self.assertEqual(mockpost.call_count,1)

    def test_ambiguous_worker_failure_never_retries(self):
        with patch("rendering_review.one_job.requests.post",
                   side_effect=requests.exceptions.Timeout()) as post:
            with patch("rendering_review.one_job._access_headers",return_value={}):
                with self.assertRaisesRegex(ExactReviewRenderDenied,
                                          "reply_ambiguous_reconcile"):
                    _post_once("https://studio.chicagoshining.com","s"*32,
                        "/api/internal/rendering-review/claim-render-job",{})
                self.assertEqual(post.call_count,1)

    def test_ledger_request_is_one_shot_no_redirect_and_checks_receipt(self):
        headers={"X-Rendering-Review-Job-Secret":"s"*32}
        with patch("rendering_review.remote_ledger.requests.post",
                   return_value=Response(200,{"verified":True})) as post:
            r=RemoteLaunchLedger._one_shot_post(
                "https://studio.chicagoshining.com/api/internal/rendering-review/launch-ledger",
                {"action":"read_authority"},headers,10.0)
            self.assertTrue(r["verified"])
            self.assertEqual(post.call_count,1)
            self.assertFalse(post.call_args.kwargs["allow_redirects"])
            self.assertEqual(post.call_args.kwargs["headers"]["User-Agent"],"")
        for status in (302,403,500):
            with patch("rendering_review.remote_ledger.requests.post",
                       return_value=Response(status,{})) as post:
                with self.assertRaises(ReviewLedgerUnavailable):
                    RemoteLaunchLedger._one_shot_post(
                        "https://studio.chicagoshining.com/api/internal/rendering-review/launch-ledger",
                        {"action":"read_authority"},headers,10.0)
                self.assertEqual(post.call_count,1)


if __name__ == "__main__":
    unittest.main()
