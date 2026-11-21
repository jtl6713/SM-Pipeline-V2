import json
import unittest
from urllib.parse import parse_qs, urlparse

from qa_ledger_live_readback import fetch_rows, inspect
from qa_ledger_backfill_preflight_test import fixtures

REF = "vkwvscgisqsbuwagdvtb"
KEY = "not-a-real-service-key"


class FakeResponse:
    def __init__(self, rows):
        self.payload = json.dumps(rows).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return self.payload


class LiveQaReadbackTest(unittest.TestCase):
    def test_nonmutating_exact_project_and_source_target_parity(self):
        runs, events, target_runs, target_events = fixtures()
        requests = []

        def requester(req):
            parsed = urlparse(req.full_url)
            requests.append(req)
            self.assertEqual(req.get_method(), "GET")
            self.assertEqual(parsed.netloc, REF + ".supabase.co")
            self.assertTrue(parsed.path.startswith("/rest/v1/studio_qa_"))
            self.assertEqual(req.get_header("Authorization"), "Bearer " + KEY)
            selected = parse_qs(parsed.query)["select"][0].split(",")
            self.assertIn("legacy_source_fields", selected)
            self.assertIn("legacy_row_sha256", selected)
            self.assertIn("run_id", selected)
            if parsed.path.endswith("studio_qa_runs"):
                self.assertIn("created_by", selected)
                self.assertIn("created_at_utc", selected)
                self.assertIn("status", selected)
                self.assertIn("deployment", selected)
            else:
                self.assertIn("execution_id", selected)
                self.assertIn("actor_id", selected)
                self.assertIn("recorded_at_utc", selected)
                self.assertIn("payload_json", selected)
            return FakeResponse(target_runs if parsed.path.endswith("studio_qa_runs") else target_events)

        result = inspect(runs, events, REF, KEY, 1, 1, requester)
        self.assertTrue(result["history_parity_verified"])
        self.assertFalse(result["release_authorized"])
        self.assertEqual(len(requests), 2)

    def test_canonical_event_drift_fails_live_history_readback(self):
        runs, events, target_runs, target_events = fixtures()
        target_events[0]["payload_json"] = {"decision": "Approved"}

        def requester(req):
            return FakeResponse(target_runs if
                req.full_url.split("?")[0].endswith("studio_qa_runs")
                else target_events)

        result = inspect(runs, events, REF, KEY, 1, 1, requester)
        self.assertFalse(result["history_parity_verified"])
        self.assertTrue(any("canonical columns diverge" in x
                            for x in result["blockers"]))

    def test_wrong_target_fails_even_when_count_matches(self):
        runs, events, target_runs, target_events = fixtures()
        target_events[0]["legacy_row_sha256"] = "0" * 64

        def requester(req):
            return FakeResponse(target_runs if req.full_url.split("?")[0].endswith("studio_qa_runs") else target_events)

        result = inspect(runs, events, REF, KEY, 1, 1, requester)
        self.assertFalse(result["history_parity_verified"])

    def test_extra_rows_refuse_false_zero_or_success(self):
        runs, events, target_runs, target_events = fixtures()

        def requester(_req):
            return FakeResponse(target_runs + target_runs)

        with self.assertRaisesRegex(ValueError, "exceeds"):
            inspect(runs, events, REF, KEY, 1, 1, requester)

    def test_no_secret_no_query_and_wrong_project_ref_denied(self):
        for ref, key in ((REF, ""), ("bad-project-ref", KEY)):
            with self.assertRaises(ValueError):
                fetch_rows(ref, key, "studio_qa_runs", 0)
        with self.assertRaises(ValueError):
            fetch_rows(REF, KEY, "studio_outputs", 0)

    def test_failed_or_unavailable_reads_are_never_empty_success(self):
        def unavailable(_req):
            raise ConnectionError("provider response unavailable")

        with self.assertRaisesRegex(ValueError, "unavailable"):
            fetch_rows(REF, KEY, "studio_qa_runs", 1, unavailable)


if __name__ == "__main__":
    unittest.main()
