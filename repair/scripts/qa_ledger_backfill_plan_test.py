import unittest

from qa_ledger_backfill_plan import prepare_import
from qa_ledger_backfill_preflight import reconcile
from qa_ledger_backfill_preflight_test import fixtures


class QaHistoricalImportPlanTests(unittest.TestCase):
    def test_preserves_historical_status_legacy_hash_and_original_fields(self):
        runs, events, _, _ = fixtures()
        plan = prepare_import(runs, events, 1, 1)
        self.assertEqual(plan["summary"]["source_runs"], 1)
        self.assertEqual(plan["summary"]["source_events"], 1)
        self.assertEqual(plan["summary"]["production_mutations"], 0)
        self.assertFalse(plan["summary"]["approved_to_apply"])
        self.assertEqual(plan["runs"][0]["status"], "Synthetic Storage Verification")
        self.assertEqual(plan["runs"][0]["payload_hash"],
                         "legacy-synthetic-payload-hash-token")
        self.assertEqual(plan["events"][0]["payload_hash"],
                         "legacy-synthetic-event-token")
        self.assertEqual(plan["runs"][0]["legacy_source_fields"], runs[0]["fields"])
        self.assertEqual(plan["events"][0]["legacy_source_fields"], events[0]["fields"])
        # Prove the readback reconciliation accepts the planned rows without
        # silently substituting a fabricated legacy hash or event.
        result = reconcile(runs, events, plan["runs"], plan["events"], 1, 1)
        self.assertTrue(result["history_parity_verified"])
        self.assertFalse(result["release_authorized"])

    def test_partial_or_wrong_count_fails_before_producing_import(self):
        runs, events, _, _ = fixtures()
        with self.assertRaisesRegex(ValueError, "count mismatch"):
            prepare_import(runs, events, 1, 0)

    def test_orphan_event_is_never_dropped(self):
        runs, events, _, _ = fixtures()
        events[0]["fields"]["Run ID"] = "qa-99999999-9999-4999-8999-999999999999"
        with self.assertRaisesRegex(ValueError, "Orphan historical"):
            prepare_import(runs, events, 1, 1)

    def test_duplicate_event_execution_id_is_blocked(self):
        runs, events, _, _ = fixtures()
        copied = {
            "id": "recDDDDDDDDDDDDDD",
            "fields": dict(events[0]["fields"], **{"Idempotency Key": "different-key"}),
        }
        with self.assertRaisesRegex(ValueError, "Duplicate historical execution"):
            prepare_import(runs, events + [copied], 1, 2)

    def test_invalid_utc_timestamp_is_blocked(self):
        runs, events, _, _ = fixtures()
        runs[0]["fields"]["Created At UTC"] = "2026-11-06T00:00:00"
        with self.assertRaisesRegex(ValueError, "explicit UTC"):
            prepare_import(runs, events, 1, 1)


if __name__ == "__main__":
    unittest.main()
