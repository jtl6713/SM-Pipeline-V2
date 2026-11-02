import os
import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from airtable.egress_monitor import persist_airtable_egress, read_airtable_egress, _metrics_path


class DurableEgressTests(unittest.TestCase):
    def test_default_path_uses_mounted_scratch(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(_metrics_path(), '/scratch/metrics/airtable-egress.sqlite')

    def test_count_rollup_and_status_classes(self):
        with tempfile.TemporaryDirectory() as folder:
            target = os.path.join(folder, "metrics.sqlite")
            with patch.dict(os.environ, {"AIRTABLE_EGRESS_SQLITE_PATH": target}):
                self.assertTrue(persist_airtable_egress("GET", 200))
                self.assertTrue(persist_airtable_egress("GET", 429))
                self.assertTrue(persist_airtable_egress("GET", 403))
                self.assertTrue(persist_airtable_egress("GET", 200))
                out = read_airtable_egress(24)
                self.assertTrue(out["ok"])
                self.assertEqual(sum(x["attempts"] for x in out["hourly"]), 4)
                self.assertEqual({x["status_class"] for x in out["hourly"]}, {"2xx", "429", "4xx"})

    def test_not_configured_not_reported_as_zero(self):
        with patch.dict(os.environ, {"AIRTABLE_EGRESS_SQLITE_PATH": ""}):
            self.assertFalse(persist_airtable_egress("GET", 200))
            self.assertFalse(read_airtable_egress()["ok"])


if __name__ == "__main__":
    unittest.main()
