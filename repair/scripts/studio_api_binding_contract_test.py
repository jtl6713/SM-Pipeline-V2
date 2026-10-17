from __future__ import annotations

import unittest

from studio_api_binding_contract import (
    CORE_BINDINGS,
    RESERVATION_BINDINGS,
    assert_live_contract,
    evaluate_bindings,
)


class StudioApiBindingContractTest(unittest.TestCase):
    def legacy_core(self):
        return dict(CORE_BINDINGS)

    def test_default_contract_requires_reservation_bindings(self):
        result = evaluate_bindings(self.legacy_core())
        self.assertFalse(result["ok"])
        self.assertEqual(result["reservation_missing"], RESERVATION_BINDINGS)

    def test_bootstrap_allows_both_reservation_bindings_to_be_absent(self):
        result = assert_live_contract(
            self.legacy_core(),
            "bootstrap",
            allow_reservation_absent=True,
        )
        self.assertTrue(result["ok"])
        self.assertTrue(result["reservation_bootstrap_absent"])

    def test_bootstrap_never_allows_partial_reservation_contract(self):
        partial = self.legacy_core()
        partial["STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(
                partial,
                "partial bootstrap",
                allow_reservation_absent=True,
            )

    def test_postbootstrap_contract_requires_exact_types(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        result = assert_live_contract(got, "postbootstrap")
        self.assertTrue(result["ok"])
        self.assertTrue(result["reservation_ok"])
        self.assertFalse(result["reservation_bootstrap_absent"])

    def test_scoped_scheduling_allowlist_is_approved_plain_text_only(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST"] = "plain_text"
        result = assert_live_contract(got, "one scoped scheduling lane")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST"])

        got["STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "wrong scheduling allowlist binding type")

    def test_unknown_scheduling_binding_is_still_rejected(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST_UNSAFE"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown scheduling binding")

    def test_wrong_durable_object_type_fails(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_SCHEDULE_RESERVATIONS"] = "service"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "wrong type")


if __name__ == "__main__":
    unittest.main()
