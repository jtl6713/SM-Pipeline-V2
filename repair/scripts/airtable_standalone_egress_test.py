import tempfile
import unittest
from pathlib import Path
from airtable_standalone_egress import record_attempt,attest_hour,export

class StandaloneEgressTests(unittest.TestCase):
    def test_durable_deduplicated_attempts_and_completed_hour(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=str(Path(tmp)/"metrics.sqlite")
            args=dict(event_id="run1-request1",source="standalone_scripts",method="GET",
                      status_class="2xx",at="2026-10-20T10:05:00Z")
            record_attempt(db,**args)
            record_attempt(db,**args)
            attest_hour(db,source="standalone_scripts",hour="2026-10-20T10:00:00Z",
                        observed_at="2026-10-20T11:01:00Z")
            x=export(db,source="standalone_scripts",
                     start="2026-10-20T10:00:00+00:00",end="2026-10-20T11:00:00+00:00")
            self.assertEqual(x["hourly"][0]["attempts"],1)
            self.assertEqual(len(x["attestations"]),1)
    def test_reject_attestation_of_open_hour(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                attest_hour(str(Path(tmp)/"metrics.sqlite"),source="standalone_scripts",
                            hour="2026-10-20T10:00:00Z",observed_at="2026-10-20T10:59:59Z")
if __name__=="__main__":
    unittest.main()
