import copy
import json
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse

from qa_ledger_backfill_apply import CONFIRMATION, api_request, apply_plan, verify_approval
from qa_ledger_backfill_plan import prepare_import
from qa_ledger_backfill_preflight_test import fixtures

REF = "vkwvscgisqsbuwagdvtb"
KEY = "not-a-real-secret"


class FakeResponse:
    def __init__(self, rows, status=200):
        self.status = status
        self.rows = json.dumps(rows).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, max_bytes=None):
        return self.rows if max_bytes is None else self.rows[:max_bytes]


def case():
    runs, events, _, _ = fixtures()
    plan = prepare_import(runs, events, 1, 1)
    approval = {
        "project_ref": REF,
        "source_runs": 1,
        "source_events": 1,
        "runs_digest": plan["summary"]["runs_digest"],
        "events_digest": plan["summary"]["events_digest"],
        "independent_review_approved": True,
        "backup_evidence_ref": "independently-reviewed-private-backup-receipt",
        "rollback_evidence_ref": "independently-reviewed-private-restore-proof",
        "reviewed_by": "independent-approver",
        "reviewed_at_utc": "2026-11-21T07:00:00Z",
        "maintenance_change_id": "QA-CHG-001",
    }
    return plan, approval


class MemoryGateway:
    def __init__(self):
        self.records = {"studio_qa_runs": [], "studio_qa_events": []}
        self.requests = []

    def __call__(self, req):
        u = urlparse(req.full_url)
        assert u.scheme == "https"
        assert u.hostname == REF + ".supabase.co"
        table = u.path.rsplit("/", 1)[-1]
        assert table in self.records
        method = req.get_method()
        assert method in ("GET", "POST")
        assert req.get_header("Authorization") == "Bearer " + KEY
        self.requests.append((method, table))
        if method == "GET":
            qs = parse_qs(u.query)
            assert qs.get("limit") == ["2"]
            key = qs["legacy_record_id"][0].removeprefix("eq.")
            return FakeResponse([
                x for x in self.records[table] if x["legacy_record_id"] == key
            ])
        value = json.loads(req.data)
        assert req.get_header("Prefer") == "return=representation"
        self.records[table].append(value)
        return FakeResponse([value], 201)


class QaAppendOnlyImportTests(unittest.TestCase):
    def test_private_evidence_and_confirmation_required_before_any_request(self):
        plan, approval = case()
        calls = MemoryGateway()
        for field in (
            "backup_evidence_ref", "rollback_evidence_ref", "reviewed_by",
            "reviewed_at_utc", "maintenance_change_id",
        ):
            trial = dict(approval)
            trial.pop(field)
            with self.assertRaisesRegex(ValueError, "lacks"):
                apply_plan(plan, trial, REF, KEY, CONFIRMATION, requester=calls)
        with self.assertRaisesRegex(ValueError, "confirmation"):
            apply_plan(plan, approval, REF, KEY, "", requester=calls)
        with self.assertRaisesRegex(ValueError, "different project"):
            apply_plan(plan, approval, "yxhfaksetrxdezoodibq", KEY, CONFIRMATION, requester=calls)
        self.assertEqual(calls.requests, [])

    def test_import_is_get_post_only_and_automatically_resumable(self):
        plan, approval = case()
        calls = MemoryGateway()
        outcome = apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        self.assertEqual(outcome["runs_inserted"], 1)
        self.assertEqual(outcome["events_inserted"], 1)
        self.assertFalse(outcome["release_authorized"])
        self.assertEqual(calls.requests, [
            ("GET", "studio_qa_runs"), ("POST", "studio_qa_runs"),
            ("GET", "studio_qa_events"), ("POST", "studio_qa_events"),
        ])
        second = apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        self.assertEqual(second["runs_reused"], 1)
        self.assertEqual(second["events_reused"], 1)
        self.assertEqual(second["runs_inserted"], 0)
        self.assertEqual(second["events_inserted"], 0)
        self.assertEqual(len(calls.records["studio_qa_runs"]), 1)
        self.assertEqual(len(calls.records["studio_qa_events"]), 1)

    def test_differing_immutable_provenance_blocks_reimport(self):
        plan, approval = case()
        calls = MemoryGateway()
        apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        calls.records["studio_qa_runs"][0]["payload_hash"] = "tampered"
        with self.assertRaisesRegex(ValueError, "conflicts"):
            apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        self.assertEqual(len(calls.records["studio_qa_runs"]), 1)

    def test_missing_or_differing_inventory_blocks_before_network(self):
        plan, approval = case()
        trial = dict(approval, runs_digest="0" * 64)
        calls = MemoryGateway()
        with self.assertRaisesRegex(ValueError, "source inventory"):
            apply_plan(plan, trial, REF, KEY, CONFIRMATION, requester=calls)
        self.assertEqual(calls.requests, [])

    def test_unapproved_http_methods_and_tables_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "allowlist"):
            api_request(REF, KEY, "studio_qa_runs", method="DELETE", params={})
        with self.assertRaisesRegex(ValueError, "allowlist"):
            api_request(REF, KEY, "studio_outputs", method="GET", params={})

    def test_duplicate_source_and_target_json_key_order_is_accepted(self):
        plan, approval = case()
        calls = MemoryGateway()
        apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        saved = calls.records["studio_qa_runs"][0]
        saved["legacy_source_fields"] = dict(reversed(list(saved["legacy_source_fields"].items())))
        reused = apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=calls)
        self.assertEqual(reused["runs_reused"], 1)

    def test_409_cannot_mask_unknown_or_divergent_record(self):
        plan, approval = case()
        calls = MemoryGateway()

        class RacingGateway:
            def __init__(self, valid):
                self.valid = valid
                self.once = False

            def __call__(self, req):
                table = urlparse(req.full_url).path.rsplit("/", 1)[-1]
                if table == "studio_qa_runs" and req.get_method() == "POST":
                    # Another writer might have won the legacy unique-key race.
                    if not self.once:
                        self.once = True
                        if self.valid:
                            calls.records[table].append(copy.deepcopy(plan["runs"][0]))
                    raise HTTPError(req.full_url, 409, "conflict", {}, None)
                return calls(req)

        with self.assertRaisesRegex(ValueError, "not a verified replay"):
            apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=RacingGateway(False))

        calls = MemoryGateway()
        result = apply_plan(plan, approval, REF, KEY, CONFIRMATION, requester=RacingGateway(True))
        self.assertEqual(result["runs_reused"], 1)
        self.assertEqual(result["events_inserted"], 1)


if __name__ == "__main__":
    unittest.main()
