"""Retirement collector proof must be real; missing UTC hours are never zero."""
import copy
import unittest
from datetime import datetime, timedelta, timezone

from airtable_retirement_core_coverage import core_coverage_report


def stamp(at):
    return at.strftime("%Y-%m-%dT%H:%M:%SZ")


class CoreEvidenceTest(unittest.TestCase):
    def setUp(self):
        # Keep the entire window completed, independent of test run time.
        self.start = (datetime.now(timezone.utc) - timedelta(hours=8)).replace(
            minute=0, second=0, microsecond=0)
        self.end = self.start + timedelta(hours=6)
        hours = [self.start + timedelta(hours=i) for i in range(6)]
        coverage = [
            {"hour_utc": stamp(h), "first_at": stamp(h + timedelta(minutes=2)),
             "last_at": stamp(h + timedelta(minutes=56)), "samples": 12}
            for h in hours
        ]
        self.worker = {
            "ok": True, "source": "profile_summary_durable_object",
            "exported_at_utc": stamp(self.end + timedelta(minutes=1)),
            "hourly": [], "collector_coverage": copy.deepcopy(coverage),
        }
        self.runner = {
            "ok": True, "source": "pipeline_runner_sqlite",
            "collector_heartbeat": {"observed_at": self.end.isoformat()},
            "hourly": [], "collector_coverage": copy.deepcopy(coverage),
        }

    def run_report(self):
        return core_coverage_report(
            self.worker, self.runner, stamp(self.start), stamp(self.end),
            worker_artifact="https://github.com/org/repo/actions/runs/1",
            runner_artifact="https://github.com/org/repo/actions/runs/2",
        )

    def test_all_six_hours_with_durable_ticks_and_no_attempts(self):
        result = self.run_report()
        self.assertTrue(result["core_coverage_complete"], result["blockers"])
        self.assertFalse(result["release_authorized"])
        for name in ("studio_worker", "pipeline_runner"):
            self.assertEqual(len(result["sources"][name]), 6)
            self.assertTrue(all(row["collector_ok"] and row["attempts"] == 0
                                for row in result["sources"][name]))

    def test_missing_tick_is_not_zero(self):
        self.worker["collector_coverage"].pop(2)
        self.assertFalse(self.run_report()["core_coverage_complete"])

    def test_metrics_export_is_not_hourly_collector_proof(self):
        self.runner.pop("collector_coverage")
        self.assertFalse(self.run_report()["core_coverage_complete"])

    def test_require_near_start_and_end_and_multiple_samples(self):
        for updates in (
            {"first_at": stamp(self.start + timedelta(minutes=21))},
            {"last_at": stamp(self.start + timedelta(minutes=40))},
            {"samples": 1},
            {"samples": "12"},
            {"first_at": stamp(self.start - timedelta(seconds=1))},
        ):
            with self.subTest(updates=updates):
                item = copy.deepcopy(self.runner)
                item["collector_coverage"][0].update(updates)
                self.runner = item
                self.assertFalse(self.run_report()["core_coverage_complete"])
                self.runner["collector_coverage"][0] = {
                    "hour_utc": stamp(self.start),
                    "first_at": stamp(self.start + timedelta(minutes=2)),
                    "last_at": stamp(self.start + timedelta(minutes=56)),
                    "samples": 12,
                }

    def test_real_airtable_attempt_fails_even_with_healthy_collector(self):
        self.worker["hourly"] = [{
            "hour_utc": stamp(self.start + timedelta(hours=3)),
            "source": "studio_worker_gateway",
            "method": "GET", "status_class": "2xx", "attempts": 1,
        }]
        result = self.run_report()
        self.assertFalse(result["core_coverage_complete"])
        self.assertTrue(any("attempts observed" in b for b in result["blockers"]))

    def test_partial_export_and_wrong_source_are_blocked(self):
        self.runner["source"] = "profile_summary_durable_object"
        self.assertFalse(self.run_report()["core_coverage_complete"])
        self.runner["source"] = "pipeline_runner_sqlite"
        self.runner["collector_heartbeat"]["observed_at"] = stamp(self.end - timedelta(minutes=1))
        self.assertFalse(self.run_report()["core_coverage_complete"])

    def test_bad_egress_rows_are_rejected(self):
        self.worker["hourly"] = [{"hour_utc": stamp(self.start), "attempts": "0"}]
        self.assertFalse(self.run_report()["core_coverage_complete"])

    def test_future_end_rejected(self):
        future = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        result = core_coverage_report(self.worker, self.runner, stamp(self.start), stamp(future),
                                      worker_artifact="proof", runner_artifact="proof")
        self.assertFalse(result["core_coverage_complete"])


if __name__ == "__main__":
    unittest.main()
