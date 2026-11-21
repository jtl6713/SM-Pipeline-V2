import unittest
from qa_ledger_backfill_preflight import reconcile, sha256


RUN_ID = "qa-11111111-1111-4111-8111-111111111111"
EXEC_ID = "qaex-22222222-2222-4222-8222-222222222222"


def fixtures():
    run_fields = {
        "Run ID": RUN_ID, "Catalog Revision": "historical",
        "Environment": "development",
        "Deployment JSON": '{"worker":"w","ui":"u","runner":"r"}',
        "Created By": "legacy-user", "Created At UTC": "2026-11-06T05:50:33.000Z",
        "Status": "Synthetic Storage Verification",
        "Idempotency Key": "legacy-run-01",
        # Real source may use non-SHA256 tokens; preserve, never regenerate.
        "Payload Hash": "legacy-synthetic-payload-hash-token",
    }
    event_fields = {
        "Execution ID": EXEC_ID, "Run ID": RUN_ID,
        "Test ID": "QA-RUN", "Event Kind": "RunFinalized",
        "Actor ID": "legacy-user", "Recorded At UTC": "2026-11-06T05:50:53.000Z",
        "Payload JSON": '{"decision":"Incomplete"}',
        "Idempotency Key": "RunFinalized:legacy-01",
        "Payload Hash": "legacy-synthetic-event-token",
    }
    runs = [{"id": "recAAAAAAAAAAAAAA", "fields": run_fields}]
    events = [{"id": "recBBBBBBBBBBBBBB", "fields": event_fields}]
    targets_r = [{
        "legacy_record_id": runs[0]["id"],
        "legacy_source_fields": run_fields,
        "legacy_row_sha256": sha256(run_fields),
        "run_id": RUN_ID,
        "catalog_revision": run_fields["Catalog Revision"],
        "environment": run_fields["Environment"],
        "deployment": {"worker": "w", "ui": "u", "runner": "r"},
        "created_by": run_fields["Created By"],
        "created_at_utc": run_fields["Created At UTC"],
        "status": run_fields["Status"],
        "idempotency_key": run_fields["Idempotency Key"],
        "payload_hash": run_fields["Payload Hash"],
    }]
    targets_e = [{
        "legacy_record_id": events[0]["id"],
        "legacy_source_fields": event_fields,
        "legacy_row_sha256": sha256(event_fields),
        "run_id": RUN_ID,
        "execution_id": event_fields["Execution ID"],
        "test_id": event_fields["Test ID"],
        "event_kind": event_fields["Event Kind"],
        "actor_id": event_fields["Actor ID"],
        "recorded_at_utc": event_fields["Recorded At UTC"],
        "payload_json": {"decision": "Incomplete"},
        "idempotency_key": event_fields["Idempotency Key"],
        "payload_hash": event_fields["Payload Hash"],
    }]
    return runs, events, targets_r, targets_e


class QaHistoryReconciliationTest(unittest.TestCase):
    def test_exact_historical_parity_only_proves_backfill_not_release(self):
        result = reconcile(*fixtures(), 1, 1)
        self.assertTrue(result["history_parity_verified"])
        self.assertEqual(result["blockers"], [])
        self.assertFalse(result["release_authorized"])
        self.assertTrue(result["read_only"])

    def test_canonical_operational_drift_blocks_even_with_unchanged_legacy_hash(self):
        # The preserved legacy JSON/hash can be completely valid while the
        # columns actually consumed by QA are missing or tampered.
        for kind, column, altered in (
            ("runs", "status", "Open"),
            ("runs", "deployment", {"worker": "unverified"}),
            ("runs", "created_by", "different-tester"),
            ("runs", "created_at_utc", "2026-11-07T05:50:33Z"),
            ("events", "execution_id", "qaex-99999999-9999-4999-8999-999999999999"),
            ("events", "test_id", "QA-OTHER"),
            ("events", "event_kind", "HumanApproval"),
            ("events", "actor_id", "different-tester"),
            ("events", "recorded_at_utc", "2026-11-07T05:50:53Z"),
            ("events", "payload_json", {"decision": "Approved"}),
            ("events", "idempotency_key", "other-key"),
            ("events", "payload_hash", "different-legacy-hash"),
        ):
            runs, events, target_r, target_e = fixtures()
            target = target_r if kind == "runs" else target_e
            target[0][column] = altered
            result = reconcile(runs, events, target_r, target_e, 1, 1)
            self.assertFalse(result["history_parity_verified"], (kind, column))
            self.assertTrue(any("canonical columns diverge" in x
                                for x in result["blockers"]), (kind, column))

    def test_equivalent_utc_timestamp_and_json_object_order_are_accepted(self):
        runs, events, target_r, target_e = fixtures()
        target_r[0]["created_at_utc"] = "2026-11-06T05:50:33+00:00"
        target_r[0]["deployment"] = {"runner": "r", "ui": "u", "worker": "w"}
        target_e[0]["recorded_at_utc"] = "2026-11-06T05:50:53+00:00"
        self.assertTrue(reconcile(runs, events, target_r, target_e, 1, 1)
                        ["history_parity_verified"])

    def test_missing_canonical_column_blocks_partial_select(self):
        runs, events, target_r, target_e = fixtures()
        del target_e[0]["execution_id"]
        outcome = reconcile(runs, events, target_r, target_e, 1, 1)
        self.assertFalse(outcome["history_parity_verified"])

    def test_no_target_snapshot_blocks_even_when_source_is_complete(self):
        runs, events, _, _ = fixtures()
        result = reconcile(runs, events, None, None, 1, 1)
        self.assertFalse(result["history_parity_verified"])
        self.assertIn("Independent Supabase target readback missing", result["blockers"])

    def test_bad_import_hash_cannot_silently_approve(self):
        runs, events, target_r, target_e = fixtures()
        target_e[0]["legacy_row_sha256"] = "0" * 64
        result = reconcile(runs, events, target_r, target_e, 1, 1)
        self.assertFalse(result["history_parity_verified"])
        self.assertTrue(any("source field/hash" in x for x in result["blockers"]))

    def test_omitted_orphan_event_is_not_zero(self):
        runs, events, _, _ = fixtures()
        events[0]["fields"]["Run ID"] = "qa-99999999-9999-4999-8999-999999999999"
        result = reconcile(runs, events, None, None, 1, 1)
        self.assertIn("Orphan QA events in source export", result["blockers"])

    def test_expected_record_count_must_be_explicit_and_exact(self):
        runs, events, tr, te = fixtures()
        result = reconcile(runs, events, tr, te, 2, 1)
        self.assertFalse(result["history_parity_verified"])
        self.assertTrue(any("Source counts disagree" in x for x in result["blockers"]))

    def test_duplicate_idempotency_key_is_rejected(self):
        runs, events, tr, te = fixtures()
        duplicate = {"id": "recCCCCCCCCCCCCCC", "fields":dict(runs[0]["fields"])}
        with self.assertRaisesRegex(ValueError, "Duplicate QA run ID|duplicate canonical idempotency"):
            reconcile(runs + [duplicate], events, tr, te, 2, 1)


if __name__ == "__main__":
    unittest.main()
