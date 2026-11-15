"""Ensure runner Airtable egress accounting includes direct Sessions exactly once."""
import unittest
from unittest.mock import patch

import requests
from airtable.constants import BRANDS_TABLE, PLATFORM_OUTPUTS_TABLE
from airtable.egress_monitor import install_airtable_egress_monitor, table_kind_from_airtable_url
from settings_store import ENGAGEMENT_SETTINGS_TABLE


class MonitorTests(unittest.TestCase):
    def test_install_idempotent_and_tracks_direct_request(self):
        install_airtable_egress_monitor()
        hooked = requests.sessions.Session.send
        install_airtable_egress_monitor()
        self.assertIs(hooked, requests.sessions.Session.send)

        fake = requests.Response()
        fake.status_code = 200
        prepared = requests.Request(
            "GET", f"https://api.airtable.com/v0/appe33zkZn35yirTL/{PLATFORM_OUTPUTS_TABLE}/recX"
        ).prepare()
        with patch("airtable.egress_monitor._original_send", return_value=fake) as send, \
             self.assertLogs("pipeline-runner.airtable.egress", level="INFO") as captured:
            out = requests.Session().send(prepared)
        self.assertIs(out, fake)
        self.assertEqual(send.call_count, 1)
        events = [line for line in captured.output if "studio_airtable_egress_v1" in line]
        self.assertEqual(len(events), 1)
        self.assertIn("pipeline_runner_http", events[0])
        self.assertIn('"table_kind":"outputs"', events[0])
        self.assertNotIn(PLATFORM_OUTPUTS_TABLE, events[0])
        self.assertNotIn("/recX", events[0])

    def test_table_kind_from_url(self):
        self.assertEqual(
            table_kind_from_airtable_url(
                f"https://api.airtable.com/v0/appe33zkZn35yirTL/{PLATFORM_OUTPUTS_TABLE}"
            ),
            "outputs",
        )
        self.assertEqual(
            table_kind_from_airtable_url("https://api.airtable.com/v0/appe33zkZn35yirTL/tblUnknown"),
            "other",
        )
        self.assertEqual(
            table_kind_from_airtable_url(
                f"https://api.airtable.com/v0/appe33zkZn35yirTL/{BRANDS_TABLE}/recX"
            ),
            "brands",
        )
        self.assertEqual(
            table_kind_from_airtable_url(
                f"https://api.airtable.com/v0/appe33zkZn35yirTL/{ENGAGEMENT_SETTINGS_TABLE}"
            ),
            "engagement_settings",
        )

    def test_unrelated_request_does_not_count(self):
        install_airtable_egress_monitor()
        fake = requests.Response()
        prepared = requests.Request("GET", "https://example.com/page").prepare()
        with patch("airtable.egress_monitor._original_send", return_value=fake) as send:
            requests.Session().send(prepared)
        self.assertEqual(send.call_count, 1)


if __name__ == "__main__":
    unittest.main()
