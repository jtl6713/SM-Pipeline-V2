import unittest
from datetime import datetime, timezone, timedelta
from shadow_24h_auto_evidence import compare

LIMITS = [1000,2500,5000,10000,15000,30000,60000]

def evidence(date, count=0, slow=0, requests=0):
    return {
        "complete": True,
        "error": "",
        "captured_at": date.isoformat(),
        "evidence": {
            "dirty_enqueued": count,
            "dirty_applied": count,
            "airtable_dirty_batch_attempts": requests,
            "airtable_dirty_batch_successes": requests,
            "airtable_dirty_batch_errors": 0,
            "dirty_lag_le_buckets": [
                {"le_ms": x, "count": count-slow if x == 2500 else slow if x == 30000 else 0} for x in LIMITS
            ],
            "dirty_lag_over_60000": 0,
        }
    }


class TestAutoEvidence(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 10, 20, 10, 13, tzinfo=timezone.utc)
    def test_missing_history_is_not_pass(self):
        result = compare(evidence(self.start + timedelta(hours=24)), None)
        self.assertFalse(result["ready"])
        self.assertIsNone(result["net_airtable_savings"])
    def test_genuine_24h_observation(self):
        result = compare(evidence(self.start + timedelta(hours=24), 50, 1, 15), evidence(self.start))
        self.assertTrue(result["ready"])
        self.assertTrue(result["freshness_gate_passed"])
        self.assertEqual(result["observed_samples"], 50)
        self.assertEqual(result["p95_upper_bound_ms"], 2500)
        self.assertIsNone(result["net_airtable_savings"])
    def test_21h_is_not_24h(self):
        result = compare(evidence(self.start + timedelta(hours=21), 50), evidence(self.start))
        self.assertFalse(result["ready"])
    def test_small_samples_do_not_pass(self):
        result = compare(evidence(self.start + timedelta(hours=24), 10), evidence(self.start))
        self.assertTrue(result["ready"])
        self.assertFalse(result["freshness_gate_passed"])
    def test_reset_fails_closed(self):
        result = compare(evidence(self.start + timedelta(hours=24), 2, 0, 1), evidence(self.start, 30, 0, 11))
        self.assertFalse(result["ready"])
        self.assertEqual(result["reason"], "missing_or_reset_shadow_counters")


if __name__ == "__main__":
    unittest.main()
