import unittest
from datetime import datetime, timezone
from durable_airtable_window_report import compare, hour_key

class DurableWindowsTests(unittest.TestCase):
    def test_merge_source_counts(self):
        worker={"ok": True, "hourly":[{"hour_utc":"2026-10-20T09:00:00Z","source":"studio_worker_gateway","attempts":9},{"hour_utc":"2026-10-20T09:00:00Z","source":"shadow_dirty_replay","attempts":2}]}
        runner={"ok": True, "hourly":[{"hour_utc":"2026-10-20T09:00:00Z","source":"pipeline_runner_http","attempts":3}]}
        result=compare(worker,runner,hour_key("2026-10-20T09:00:00Z"),1)
        self.assertEqual(result["total_instrumented"],14)
        self.assertEqual(result["by_source"]["shadow_dirty_replay"],2)

    def test_unavailable_runner_is_not_zero(self):
        worker={"ok":True, "hourly":[]}
        runner={"ok":False,"reason":"persistent_metrics_store_not_configured"}
        self.assertFalse(compare(worker,runner,hour_key("2026-10-20T09:00:00Z"),1)["ok"])

if __name__=="__main__":
    unittest.main()
