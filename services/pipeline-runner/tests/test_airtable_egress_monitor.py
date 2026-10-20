"""Ensure runner Airtable egress accounting includes direct Sessions exactly once."""
import unittest
from unittest.mock import patch

import requests
from airtable.egress_monitor import install_airtable_egress_monitor


class MonitorTests(unittest.TestCase):
    def test_install_idempotent_and_tracks_direct_request(self):
        install_airtable_egress_monitor()
        hooked = requests.sessions.Session.send
        install_airtable_egress_monitor()
        self.assertIs(hooked, requests.sessions.Session.send)

        fake = requests.Response()
        fake.status_code = 200
        prepared = requests.Request("GET", "https://api.airtable.com/v0/base/table/record").prepare()
        with patch("airtable.egress_monitor._original_send", return_value=fake) as send, \
             self.assertLogs("pipeline-runner.airtable.egress", level="INFO") as captured:
            out = requests.Session().send(prepared)
        self.assertIs(out, fake)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(len(captured.records), 1)
        self.assertIn("pipeline_runner_http", captured.output[0])
        self.assertNotIn("/base/table/record", captured.output[0])

    def test_unrelated_request_does_not_count(self):
        install_airtable_egress_monitor()
        fake = requests.Response()
        prepared = requests.Request("GET", "https://example.com/page").prepare()
        with patch("airtable.egress_monitor._original_send", return_value=fake) as send:
            requests.Session().send(prepared)
        self.assertEqual(send.call_count, 1)


if __name__ == "__main__":
    unittest.main()
