import json
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).parent))
import airtable_request_window_report as report


class AirtableRequestReportTests(unittest.TestCase):
    def test_counts_equal_windows_and_statuses(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "requests.jsonl"
            path.write_text("\n".join([
                'studio_airtable_egress_v1 '+json.dumps({"source": "studio_worker_gateway", "at": "2026-10-19T12:00:00Z", "status": 200, "request_count": 3}),
                'studio_airtable_egress_v1 '+json.dumps({"source": "pipeline_runner_client", "at": "2026-10-19T12:05:00Z", "status": 429, "request_count": 1}),
                'studio_airtable_egress_v1 '+json.dumps({"source": "studio_worker_gateway", "at": "2026-10-20T12:00:00Z", "status": 200, "request_count": 1}),
            ]))
            events = report.read_events([str(path)])
            before = report.summarize(events, report.datetime.fromisoformat("2026-10-19T00:00:00+00:00"), 24)
            after = report.summarize(events, report.datetime.fromisoformat("2026-10-20T00:00:00+00:00"), 24)
            self.assertEqual(before["total_observed"], 4)
            self.assertEqual(after["total_observed"], 1)
            self.assertEqual(before["statuses"]["429"], 1)

    def test_missing_sources_never_imply_zero_savings(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "requests.jsonl"
            path.write_text('studio_airtable_egress_v1 '+json.dumps({"source": "studio_worker_gateway", "at": "2026-10-19T00:00:00Z", "status": 200}))
            with patch.object(sys, "argv", ["script", "--events", str(path), "--before", "2026-10-19T00:00:00Z",
                                            "--after", "2026-10-20T00:00:00Z"]), redirect_stdout(StringIO()) as output:
                report.main()
            value = json.loads(output.getvalue())
            self.assertFalse(value["system_wide_complete"])
            self.assertIsNone(value["net_saved_requests"])
            self.assertIsNone(value["net_saved_percent"])


if __name__ == "__main__":
    unittest.main()
