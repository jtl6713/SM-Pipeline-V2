import copy
import unittest
from datetime import datetime, timedelta, timezone

from airtable_retirement_evidence_gate import SOURCES, PROOFS, evidence_shape


class RetirementEvidenceGateTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 21, 18, tzinfo=timezone.utc)
        self.start = datetime(2026, 11, 21, 9, tzinfo=timezone.utc)
        hours = [(self.start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ") for i in range(6)]
        self.manifest = {
            "schema_version": 1,
            "production_project_ref": "p" * 20,
            "runtime_source_modes": {
                "studio_primary_read_source": "supabase",
                "studio_sync_read_source": "supabase",
                "pipeline_runner_write_source": "supabase",
            },
            "proofs": {k: {"verified": True, "artifact_ref": f"reviewed-{k}-artifact"}
                       for k in PROOFS},
            "quiet_window": {
                "start_utc": self.start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end_utc": (self.start + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sources": {s: [{"hour_utc": h, "attempts": 0, "collector_ok": True,
                                 "artifact_ref": f"{s}:{h}"} for h in hours] for s in SOURCES}
            },
        }

    def check(self, obj):
        return evidence_shape(obj, now=self.now)

    def test_complete_synthetic_shape_is_not_release_approval(self):
        result = self.check(self.manifest)
        self.assertTrue(result["evidence_layout_complete"])
        self.assertFalse(result["release_authorized"])
        self.assertTrue(result["manual_verification_required"])

    def test_empty_or_unidentified_project_fails_closed(self):
        self.assertFalse(self.check({})["evidence_layout_complete"])
        for ref in (None, "", "yxhfaksetrxdezoodibq"):
            item = copy.deepcopy(self.manifest)
            item["production_project_ref"] = ref
            self.assertFalse(self.check(item)["evidence_layout_complete"])

    def test_historically_named_dev_project_is_valid_when_evidence_is_complete(self):
        item = copy.deepcopy(self.manifest)
        item["production_project_ref"] = "vkwvscgisqsbuwagdvtb"
        result = self.check(item)
        self.assertTrue(result["evidence_layout_complete"])
        self.assertFalse(result["release_authorized"])

    def test_legacy_live_airtable_primary_read_blocks_release(self):
        item = copy.deepcopy(self.manifest)
        item["runtime_source_modes"]["studio_primary_read_source"] = "airtable"
        self.assertFalse(self.check(item)["evidence_layout_complete"])
        item["runtime_source_modes"]["studio_primary_read_source"] = "supabase"
        item["runtime_source_modes"]["studio_sync_read_source"] = "airtable"
        self.assertFalse(self.check(item)["evidence_layout_complete"])

    def test_missing_required_source_or_one_hour_fails_closed(self):
        for source in SOURCES:
            item = copy.deepcopy(self.manifest)
            del item["quiet_window"]["sources"][source]
            self.assertFalse(self.check(item)["evidence_layout_complete"])
        item = copy.deepcopy(self.manifest)
        item["quiet_window"]["sources"]["studio_worker"].pop(0)
        self.assertFalse(self.check(item)["evidence_layout_complete"])

    def test_missing_heartbeat_or_nonzero_egress_fails_closed(self):
        for updates in ({"collector_ok": False}, {"attempts": 1},
                        {"attempts": "0"}, {"artifact_ref": ""}):
            item = copy.deepcopy(self.manifest)
            item["quiet_window"]["sources"]["pipeline_runner"][2].update(updates)
            self.assertFalse(self.check(item)["evidence_layout_complete"])

    def test_future_partial_window_and_duplicate_hours_fail_closed(self):
        future = copy.deepcopy(self.manifest)
        future["quiet_window"]["end_utc"] = "2026-11-21T19:00:00Z"
        self.assertFalse(self.check(future)["evidence_layout_complete"])
        dup = copy.deepcopy(self.manifest)
        rows = dup["quiet_window"]["sources"]["github_actions"]
        rows[4]["hour_utc"] = rows[3]["hour_utc"]
        self.assertFalse(self.check(dup)["evidence_layout_complete"])

    def test_completed_synthetic_qa_history_does_not_gate_pat_retirement(self):
        # The one legacy QA run and incomplete event were migrated, verified,
        # and remain unrelated to production content/publishing egress.
        item = copy.deepcopy(self.manifest)
        self.assertNotIn("qa_ledger_migration", PROOFS)
        self.assertTrue(self.check(item)["evidence_layout_complete"])
        item["proofs"]["qa_ledger_migration"] = {
            "verified": False,
            "artifact_ref": "",
        }
        self.assertTrue(self.check(item)["evidence_layout_complete"])
        # Real zero-egress evidence is still required to revoke the PAT.
        item["quiet_window"]["sources"]["studio_worker"][0]["attempts"] = 1
        self.assertFalse(self.check(item)["evidence_layout_complete"])

    def verified_inactive(self):
        return {
            "mode": "verified_inactive",
            "inactive_since_utc": "2026-11-21T08:00:00Z",
            "verified_through_utc": "2026-11-21T18:00:00Z",
            "inventory_before_artifact_ref": "provider-admin-export-before",
            "inventory_after_artifact_ref": "provider-admin-export-after",
            "full_window_audit_artifact_ref": "provider-complete-audit-log",
            "independent_reviewer": "separate-operator",
            "verified_inactive": True,
        }

    def test_provably_disabled_sources_need_no_fake_hourly_collector(self):
        item = copy.deepcopy(self.manifest)
        for source in ("standalone_scripts", "github_actions", "make_scenarios",
                       "external_integrations"):
            item["quiet_window"]["sources"][source] = self.verified_inactive()
        result = self.check(item)
        self.assertTrue(result["evidence_layout_complete"], result["blockers"])
        self.assertEqual(result["metered_sources"], ["pipeline_runner", "studio_worker"])
        self.assertEqual(len(result["verified_inactive_sources"]), 4)
        self.assertFalse(result["release_authorized"])
        self.assertTrue(result["manual_verification_required"])
        # Inactive-source proof cannot conceal an actual live Worker attempt.
        item["quiet_window"]["sources"]["studio_worker"][1]["attempts"] = 1
        self.assertFalse(self.check(item)["evidence_layout_complete"])

    def test_core_worker_runner_cannot_bypass_hourly_measurement(self):
        for source in ("studio_worker", "pipeline_runner"):
            item = copy.deepcopy(self.manifest)
            item["quiet_window"]["sources"][source] = self.verified_inactive()
            result = self.check(item)
            self.assertFalse(result["evidence_layout_complete"])
            self.assertTrue(any("core runtime" in x for x in result["blockers"]))

    def test_inactive_proof_must_cover_whole_window_and_have_audit_trail(self):
        for bad in (
            {"inactive_since_utc": "2026-11-21T09:00:01Z"},
            {"verified_through_utc": "2026-11-21T14:59:59Z"},
            {"full_window_audit_artifact_ref": ""},
            {"inventory_before_artifact_ref": ""},
            {"inventory_after_artifact_ref": ""},
            {"independent_reviewer": ""},
            {"verified_inactive": False},
            {"mode": "claimed_inactive"},
        ):
            item = copy.deepcopy(self.manifest)
            evidence = self.verified_inactive()
            evidence.update(bad)
            item["quiet_window"]["sources"]["make_scenarios"] = evidence
            self.assertFalse(self.check(item)["evidence_layout_complete"], bad)

    def test_missing_review_artifact_or_attestation_fails_closed(self):
        for key in PROOFS:
            item = copy.deepcopy(self.manifest)
            item["proofs"][key] = {"verified": True, "artifact_ref": ""}
            self.assertFalse(self.check(item)["evidence_layout_complete"])
            item["proofs"][key] = {"verified": False, "artifact_ref": "file"}
            self.assertFalse(self.check(item)["evidence_layout_complete"])


if __name__ == "__main__":
    unittest.main()
