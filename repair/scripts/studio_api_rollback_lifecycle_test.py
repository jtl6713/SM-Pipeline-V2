from __future__ import annotations

import unittest

from studio_api_binding_contract import CORE_BINDINGS, RESERVATION_BINDINGS
from studio_api_rollback_lifecycle import (
    decide_rollback,
    durable_object_names,
    home_read_cutover_off,
    sanitize_runtime_flags,
)


def _named(name, typ="durable_object_namespace"):
    return {"name": name, "type": typ}


class StudioApiRollbackLifecycleTest(unittest.TestCase):
    def test_detects_both_sqlite_namespaces(self):
        names = durable_object_names([
            _named("STUDIO_SCHEDULE_RESERVATIONS"),
            _named("STUDIO_PROFILE_SUMMARIES"),
            _named("STUDIO_MEDIA", "r2_bucket"),
        ])
        self.assertEqual(names, {"STUDIO_SCHEDULE_RESERVATIONS", "STUDIO_PROFILE_SUMMARIES"})

    def test_same_namespaces_roll_back(self):
        bindings = [_named("STUDIO_SCHEDULE_RESERVATIONS"), _named("STUDIO_PROFILE_SUMMARIES")]
        decision = decide_rollback(
            before_version="v-old",
            current_version="v-new",
            before_bindings=bindings,
            current_bindings=bindings,
            current_plain={"STUDIO_HOME_PROFILE_SUMMARY_READS": "false"},
        )
        self.assertEqual(decision["action"], "rollback")
        self.assertFalse(decision["lifecycle"]["crosses"])

    def test_profile_summary_namespace_add_skips_historical_rollback(self):
        before = [_named("STUDIO_SCHEDULE_RESERVATIONS")]
        current = [_named("STUDIO_SCHEDULE_RESERVATIONS"), _named("STUDIO_PROFILE_SUMMARIES")]
        decision = decide_rollback(
            before_version="v-old",
            current_version="v-new",
            before_bindings=before,
            current_bindings=current,
            current_plain={
                "STUDIO_HOME_PROFILE_SUMMARY_READS": "false",
                "STUDIO_REFILL_PROFILE_SUMMARY_READS": "false",
                "STUDIO_PROFILE_SUMMARY_CAPTURE_ENABLED": "false",
            },
        )
        self.assertEqual(decision["action"], "skip_lifecycle")
        self.assertEqual(decision["lifecycle"]["added"], ["STUDIO_PROFILE_SUMMARIES"])
        self.assertTrue(home_read_cutover_off(decision["flags"]))

    def test_reservation_namespace_add_is_also_a_boundary(self):
        decision = decide_rollback(
            before_version="v-old",
            current_version="v-new",
            before_bindings=[_named("STUDIO_PROFILE_SUMMARIES")],
            current_bindings=[
                _named("STUDIO_PROFILE_SUMMARIES"),
                _named("STUDIO_SCHEDULE_RESERVATIONS"),
            ],
            current_plain={"STUDIO_HOME_PROFILE_SUMMARY_READS": "false"},
        )
        self.assertEqual(decision["action"], "skip_lifecycle")
        self.assertEqual(decision["lifecycle"]["added"], ["STUDIO_SCHEDULE_RESERVATIONS"])

    def test_refuses_to_remain_on_lifecycle_version_if_home_reads_are_on(self):
        with self.assertRaises(SystemExit):
            decide_rollback(
                before_version="v-old",
                current_version="v-new",
                before_bindings=[],
                current_bindings=[_named("STUDIO_PROFILE_SUMMARIES")],
                current_plain={"STUDIO_HOME_PROFILE_SUMMARY_READS": "true"},
            )

    def test_unchanged_version_is_noop(self):
        decision = decide_rollback(
            before_version="v-same",
            current_version="v-same",
            before_bindings=[_named("STUDIO_PROFILE_SUMMARIES")],
            current_bindings=[_named("STUDIO_PROFILE_SUMMARIES")],
        )
        self.assertEqual(decision["action"], "noop")

    def test_sanitized_flags_never_include_unlisted_settings(self):
        flags = sanitize_runtime_flags({
            "STUDIO_HOME_PROFILE_SUMMARY_READS": "false",
            "AIRTABLE_PAT": "secret",
            "AIRTABLE_BASE_ID": "appe33zkZn35yirTL",
        })
        self.assertEqual(flags["STUDIO_HOME_PROFILE_SUMMARY_READS"], "false")
        self.assertEqual(flags["STUDIO_REFILL_PROFILE_SUMMARY_READS"], "absent")
        self.assertNotIn("AIRTABLE_PAT", flags)
        self.assertNotIn("AIRTABLE_BASE_ID", flags)

    def test_binding_contract_still_treats_profile_summaries_as_optional(self):
        got = dict(CORE_BINDINGS)
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_PROFILE_SUMMARIES"] = "durable_object_namespace"
        from studio_api_binding_contract import assert_live_contract
        result = assert_live_contract(got, "optional profile summaries")
        self.assertTrue(result["optional_present"]["STUDIO_PROFILE_SUMMARIES"])


if __name__ == "__main__":
    unittest.main()
