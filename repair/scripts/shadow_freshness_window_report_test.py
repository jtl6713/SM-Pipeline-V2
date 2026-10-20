import unittest
from datetime import datetime, timezone
from shadow_freshness_window_report import delta

def record(at, count, fast, slow, requests):
    return (datetime.fromisoformat(at).replace(tzinfo=timezone.utc), {
        "dirty_enqueued": count, "dirty_applied": count,
        "airtable_dirty_batch_attempts": requests,
        "airtable_dirty_batch_successes": requests,
        "airtable_dirty_batch_errors": 0,
        "dirty_lag_le_buckets": [
            {"le_ms": x, "count": fast if x == 10000 else (slow if x == 30000 else 0)}
            for x in [1000,2500,5000,10000,15000,30000,60000]
        ],
        "dirty_lag_over_60000": 0,
    })

class TestWindow(unittest.TestCase):
    def test_p95_freshness_pass(self):
        a = record("2026-10-20T00:00:00", 0, 0, 0, 0)
        b = record("2026-10-21T00:00:00", 40, 39, 1, 7)
        output = delta(a,b)
        self.assertTrue(output["p95_15s_gate"])
        self.assertEqual(output["counts"]["airtable_dirty_batch_attempts"], 7)
        self.assertEqual(output["p95_upper_bound_ms"], 10000)

    def test_missing_samples_not_pass(self):
        a = record("2026-10-20T00:00:00", 0, 0, 0, 0)
        b = record("2026-10-21T00:00:00", 6, 6, 0, 2)
        self.assertFalse(delta(a,b)["p95_15s_gate"])

    def test_counter_reset_fails(self):
        a = record("2026-10-20T00:00:00", 40, 39, 1, 7)
        b = record("2026-10-21T00:00:00", 0, 0, 0, 0)
        with self.assertRaises(ValueError):
            delta(a,b)

if __name__ == "__main__":
    unittest.main()
