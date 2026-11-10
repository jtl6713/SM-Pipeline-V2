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

    def test_publication_recovery_bindings_are_exact_type_allowlisted(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        names = (
            "PUBLICATION_RECONCILIATION_SCAN_ENABLED",
            "PUBLICATION_RECONCILIATION_ENABLED",
            "PUBLICATION_RECONCILIATION_BOUNDED_ENABLED",
            "PUBLICATION_RECONCILIATION_CANARY_RECORD",
            "PUBLICATION_RECONCILIATION_BATCH_SIZE",
            "PUBLICATION_RECONCILIATION_INTERVAL_MINUTES",
            "PUBLICATION_RECONCILIATION_COOLDOWN_MINUTES",
            "PUBLICATION_RECONCILIATION_MAX_ATTEMPTS",
        )
        for name in names:
            got[name] = "plain_text"
        self.assertTrue(assert_live_contract(got, "guarded autonomous recovery")["ok"])
        got["PUBLICATION_RECONCILIATION_ENABLED"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "wrong recovery gate binding type")
        got["PUBLICATION_RECONCILIATION_UNSAFE_BYPASS"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unauthorized recovery binding")

    def test_exact_chicago_review_secret_bindings_are_type_allowlisted_only(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        pilot_names = (
            "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
            "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
            "RENDERING_REVIEW_INTEGRATION_VERIFIED",
            "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
            "RENDERING_REVIEW_EXACT_OUTPUT_ID",
            "RENDERING_REVIEW_RENDER_JOB_SHARED_SECRET",
            "RENDERING_REVIEW_DISPATCH_SHARED_SECRET",
            "RENDERING_REVIEW_REMOTION_BASE_URL",
        )
        got.update({name: "secret_text" for name in pilot_names})
        self.assertTrue(assert_live_contract(got, "single Reel canary")["ok"])
        got["RENDERING_REVIEW_EXACT_OUTPUT_ID"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "wrong pilot binding type")
        got["RENDERING_REVIEW_UNSAFE_BYPASS"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unapproved pilot binding")

    def test_durable_i1_activation_secret_is_preserved_with_exact_type(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        self.assertTrue(assert_live_contract(got, "durable I1 absent")["ok"])
        got["STUDIO_I1_DURABLE_JOBS"] = "secret_text"
        result = assert_live_contract(got, "durable I1 enabled")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_I1_DURABLE_JOBS"])

        got["STUDIO_I1_DURABLE_JOBS"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "durable I1 must remain secret")
        del got["STUDIO_I1_DURABLE_JOBS"]
        got["STUDIO_I1_DURABLE_JOBS_UNSAFE"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unexpected I1 binding")

    def test_dedicated_video_key_is_optional_secret_and_cannot_replace_narration(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["ELEVENLABS_API_KEY"] = "secret_text"
        self.assertTrue(assert_live_contract(got, "tts only")["ok"])
        got["ELEVENLABS_VIDEO_API_KEY"] = "secret_text"
        result = assert_live_contract(got, "separate video key")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["ELEVENLABS_API_KEY"])
        self.assertTrue(result["optional_present"]["ELEVENLABS_VIDEO_API_KEY"])
        got["ELEVENLABS_VIDEO_API_KEY"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "video key must be secret_text")
        got.pop("ELEVENLABS_VIDEO_API_KEY")
        got["ELEVENLABS_VIDEO_API_KEY_UNSAFE"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "arbitrary video API secret name rejected")

    def test_restricted_video_canary_price_bindings_are_optional_secrets_only(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["ELEVENLABS_API_KEY"] = "secret_text"
        got["ELEVENLABS_VIDEO_API_KEY"] = "secret_text"
        for name in (
            "STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT",
            "STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P_9X16",
        ):
            got[name] = "secret_text"
        self.assertTrue(assert_live_contract(got, "reviewed video price only")["ok"])
        for name in (
            "STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT",
            "STUDIO_ELEVENLABS_VIDEO_CREDITS_4S_720P_9X16",
        ):
            self.assertTrue(assert_live_contract(got)["optional_present"][name])
            got[name] = "plain_text"
            with self.assertRaises(SystemExit):
                assert_live_contract(got, "never leak reviewed video price binding")
            got[name] = "secret_text"
        got["STUDIO_ELEVENLABS_VIDEO_ENABLED"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unreviewed paid enablement blocked")

    def test_operator_video_canary_flags_are_exact_plain_text_bindings_only(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        names = (
            "STUDIO_ELEVENLABS_VIDEO_ENABLED",
            "STUDIO_ELEVENLABS_VIDEO_RIGHTS_VERIFIED",
            "STUDIO_ELEVENLABS_VIDEO_WATERMARK_VERIFIED",
        )
        # Never invent an enabled flag during deploy: all three are optional.
        self.assertTrue(assert_live_contract(got, "video flags absent")["ok"])
        for name in names:
            got[name] = "plain_text"
        approved = assert_live_contract(got, "operator verified video flags")
        self.assertTrue(approved["ok"])
        for name in names:
            self.assertTrue(approved["optional_present"][name])
            got[name] = "secret_text"
            with self.assertRaises(SystemExit):
                assert_live_contract(got, "wrong video flag type rejected")
            got[name] = "plain_text"
        got["STUDIO_ELEVENLABS_VIDEO_UNREVIEWED_OPTION"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown video config stays blocked")

    def test_b2_content_list_read_flag_is_optional_secret_only(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        self.assertTrue(assert_live_contract(got, "B2 flag absent")["ok"])
        got["STUDIO_CONTENT_READ_SOURCE"] = "secret_text"
        result = assert_live_contract(got, "B2 flag present")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_CONTENT_READ_SOURCE"])
        got["STUDIO_CONTENT_READ_SOURCE"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "B2 flag type mismatch")
        got.pop("STUDIO_CONTENT_READ_SOURCE")
        got["STUDIO_CONTENT_READ_SOURCE_BYPASS"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown B2 flag")

    def test_b3_factory_ops_read_flag_is_optional_secret_and_keeps_b2(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_CONTENT_READ_SOURCE"] = "secret_text"
        self.assertTrue(assert_live_contract(got, "B3 flag absent")["ok"])
        got["STUDIO_FACTORY_OPS_READ_SOURCE"] = "secret_text"
        result = assert_live_contract(got, "B3 flag present")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_CONTENT_READ_SOURCE"])
        self.assertTrue(result["optional_present"]["STUDIO_FACTORY_OPS_READ_SOURCE"])
        got["STUDIO_FACTORY_OPS_READ_SOURCE"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "B3 flag type mismatch")
        got.pop("STUDIO_FACTORY_OPS_READ_SOURCE")
        got["STUDIO_FACTORY_OPS_READ_SOURCE_BYPASS"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown B3 flag")

    def test_home_read_flag_is_optional_secret_and_keeps_earlier_flags(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_CONTENT_READ_SOURCE"] = "secret_text"
        got["STUDIO_FACTORY_OPS_READ_SOURCE"] = "secret_text"
        self.assertTrue(assert_live_contract(got, "Home flag absent")["ok"])
        got["STUDIO_HOME_READ_SOURCE"] = "secret_text"
        result = assert_live_contract(got, "Home flag present")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_CONTENT_READ_SOURCE"])
        self.assertTrue(result["optional_present"]["STUDIO_FACTORY_OPS_READ_SOURCE"])
        self.assertTrue(result["optional_present"]["STUDIO_HOME_READ_SOURCE"])
        got["STUDIO_HOME_READ_SOURCE"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "Home flag type mismatch")
        got.pop("STUDIO_HOME_READ_SOURCE")
        got["STUDIO_HOME_READ_SOURCE_BYPASS"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown Home flag")

    def test_write_source_flag_is_optional_secret_and_keeps_read_flags(self):
        got = self.legacy_core()
        got.update(RESERVATION_BINDINGS)
        got["STUDIO_CONTENT_READ_SOURCE"] = "secret_text"
        got["STUDIO_FACTORY_OPS_READ_SOURCE"] = "secret_text"
        got["STUDIO_HOME_READ_SOURCE"] = "secret_text"
        self.assertTrue(assert_live_contract(got, "write source absent")["ok"])
        got["STUDIO_WRITE_SOURCE"] = "secret_text"
        result = assert_live_contract(got, "write source present")
        self.assertTrue(result["ok"])
        self.assertTrue(result["optional_present"]["STUDIO_WRITE_SOURCE"])
        self.assertTrue(result["optional_present"]["STUDIO_HOME_READ_SOURCE"])
        got["STUDIO_WRITE_SOURCE"] = "plain_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "write source type mismatch")
        got.pop("STUDIO_WRITE_SOURCE")
        got["STUDIO_WRITE_SOURCE_BYPASS"] = "secret_text"
        with self.assertRaises(SystemExit):
            assert_live_contract(got, "unknown write source flag")

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
