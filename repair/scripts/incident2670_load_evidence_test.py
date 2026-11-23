"""Offline regression for incident #2670 load evidence; no live services."""
import copy
import unittest
from datetime import datetime, timedelta, timezone

from incident2670_load_evidence import compare_windows, summarize_window


def window(at="2026-11-23T00:00:00Z", *, rates=(1000, 1000, 1000, 1000),
           outbox=(0, 0, 0, 0)):
    start = datetime.fromisoformat(at.replace("Z", "+00:00"))
    return {
        "scope": "supabase_edge_logs", "coverage_complete": True,
        "buckets": [{
            "start_utc": (start + timedelta(minutes=5 * i))
                .isoformat().replace("+00:00", "Z"),
            "requests": amount,
            "errors_5xx": 0, "errors_522": 0,
            "outbox_404": outbox[i], "mutations": 5,
        } for i, amount in enumerate(rates)],
    }


class Incident2670EvidenceTests(unittest.TestCase):
    def test_actual_logged_windows_not_marked_as_comparable(self):
        # Exact aggregate results of read-only Supabase gateway log queries.
        before = window(
            "2026-11-22T12:20:00Z",
            rates=(4902, 4567, 5356, 3640),
            outbox=(264, 246, 295, 275),
        )
        after = window(
            "2026-11-23T00:00:00Z",
            rates=(1431, 813, 909, 936, 775, 782,
                   1526, 841, 877, 912, 752, 797),
            outbox=(0,) * 12,
        )
        result = compare_windows(before, after)
        self.assertEqual(result["baseline"]["requests"], 18465)
        self.assertEqual(result["baseline"]["outbox_404"], 1080)
        self.assertEqual(result["recovery"]["requests"], 11351)
        self.assertEqual(result["observed_gateway_request_rate_drop_pct"], 79.5)
        self.assertEqual(result["outbox_404"]["status"], "PASS")
        self.assertEqual(result["http_5xx"]["status"], "PASS")
        self.assertEqual(result["target_70pct"]["status"], "INCONCLUSIVE")
        self.assertEqual(result["duplicate_claims"]["status"], "INCONCLUSIVE")

    def test_normalized_target_requires_complete_comparable_work(self):
        before = window("2026-11-22T12:20:00Z")
        after = window(rates=(200, 200, 200, 200))
        units = {
            "production_jobs": 12,
            "media_transfers": 48,
            "render_jobs": 6,
            "studio_reads": 34,
        }
        before.update(work_units=units, workload_coverage_complete=True)
        after.update(work_units=dict(units), workload_coverage_complete=True)
        result = compare_windows(before, after)
        self.assertEqual(result["target_70pct"]["status"], "PASS")
        self.assertEqual(result["target_70pct"]["normalized_reduction_pct"], 80.0)
        after["workload_coverage_complete"] = False
        self.assertEqual(compare_windows(before, after)["target_70pct"]["status"], "INCONCLUSIVE")

    def test_actual_fail_not_hidden(self):
        before = window("2026-11-22T12:20:00Z")
        after = window(rates=(700, 700, 700, 700))
        units = {
            "production_jobs": 12,
            "media_transfers": 48,
            "render_jobs": 6,
            "studio_reads": 34,
        }
        before.update(work_units=units, workload_coverage_complete=True)
        after.update(work_units=units, workload_coverage_complete=True)
        self.assertEqual(compare_windows(before, after)["target_70pct"]["status"], "FAIL")

    def test_changed_mix_blocks_false_positive(self):
        before = window("2026-11-22T12:20:00Z")
        after = window(rates=(100, 100, 100, 100))
        before.update(work_units={
            "production_jobs": 12, "media_transfers": 48,
            "render_jobs": 6, "studio_reads": 34,
        }, workload_coverage_complete=True)
        after.update(work_units={
            "production_jobs": 1, "media_transfers": 1,
            "render_jobs": 1, "studio_reads": 100,
        }, workload_coverage_complete=True)
        self.assertEqual(compare_windows(before, after)["target_70pct"]["status"], "INCONCLUSIVE")

    def test_incomplete_or_gapped_logs_fail_validation(self):
        good = window()
        incomplete = copy.deepcopy(good)
        incomplete["coverage_complete"] = False
        with self.assertRaisesRegex(ValueError, "coverage"):
            summarize_window(incomplete)
        missing_bucket = copy.deepcopy(good)
        missing_bucket["buckets"][2]["start_utc"] = "2026-11-23T00:20:00Z"
        with self.assertRaisesRegex(ValueError, "missing, overlapping"):
            summarize_window(missing_bucket)

    def test_bad_metrics_or_duplicates_are_rejected(self):
        good = window()
        inconsistent = copy.deepcopy(good)
        inconsistent["buckets"][0]["errors_522"] = 2
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            summarize_window(inconsistent)
        invalid = copy.deepcopy(good)
        invalid["buckets"][0]["requests"] = True
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            summarize_window(invalid)
        duplicate = copy.deepcopy(good)
        duplicate["buckets"][1]["start_utc"] = duplicate["buckets"][0]["start_utc"]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            summarize_window(duplicate)

    def test_duplicate_claim_gate_needs_complete_audit(self):
        before, after = window("2026-11-22T12:20:00Z"), window()
        after["claim_audit"] = {
            "claim_attempts": 40,
            "duplicate_claims": 0,
        }
        self.assertEqual(compare_windows(before, after)["duplicate_claims"]["status"], "INCONCLUSIVE")
        after["claim_audit"]["cross_process_evidence_complete"] = True
        self.assertEqual(compare_windows(before, after)["duplicate_claims"]["status"], "PASS")
        after["claim_audit"]["duplicate_claims"] = 1
        self.assertEqual(compare_windows(before, after)["duplicate_claims"]["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
