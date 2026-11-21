import json
import unittest

from production_supabase_identity_audit import (
    assert_approved_target, inspect_studio_bindings, ref_from_url,
)


class ProductionTargetDiscoveryTest(unittest.TestCase):
    def setUp(self):
        self.ref = "p" * 20
        self.url = f"https://{self.ref}.supabase.co"
        self.bindings = [
            {"name": "SUPABASE_URL", "type": "plain_text", "text": self.url},
            {"name": "SUPABASE_SERVICE_ROLE_KEY", "type": "secret_text", "text": "DO_NOT_PRINT"},
        ]

    def test_discovery_never_certifies_production_by_itself(self):
        result = inspect_studio_bindings(self.bindings)
        self.assertEqual(result["candidate_project_ref"], self.ref)
        self.assertTrue(result["worker_supabase_binding_types_valid"])
        self.assertIs(result["independently_verified_production"], False)
        self.assertNotIn("DO_NOT_PRINT", json.dumps(result))

    def test_approval_requires_matching_worker_and_github_urls(self):
        result = assert_approved_target(self.bindings, self.ref, self.url)
        self.assertTrue(result["approved_project_configuration_matches"])
        with self.assertRaises(SystemExit):
            assert_approved_target(self.bindings, "q" * 20, self.url)
        with self.assertRaises(SystemExit):
            assert_approved_target(self.bindings, self.ref, f"https://{'q'*20}.supabase.co")
        with self.assertRaises(SystemExit):
            assert_approved_target(self.bindings, self.ref, None)

    def test_live_production_project_retains_historical_dev_name(self):
        ref = "vkwvscgisqsbuwagdvtb"
        url = f"https://{ref}.supabase.co"
        bindings = [dict(self.bindings[0], text=url), self.bindings[1]]
        result = inspect_studio_bindings(bindings)
        self.assertFalse(result["candidate_is_known_nonproduction"])
        self.assertFalse(result["independently_verified_production"])
        self.assertTrue(assert_approved_target(bindings, ref, url)["approved_project_configuration_matches"])

    def test_unrelated_task_organizer_remains_excluded(self):
        ref = "yxhfaksetrxdezoodibq"
        url = f"https://{ref}.supabase.co"
        bindings = [dict(self.bindings[0], text=url), self.bindings[1]]
        result = inspect_studio_bindings(bindings)
        self.assertTrue(result["candidate_is_known_nonproduction"])
        with self.assertRaises(SystemExit):
            assert_approved_target(bindings, ref, url)

    def test_missing_duplicate_or_wrong_type_bindings_fail_closed(self):
        self.assertFalse(inspect_studio_bindings(self.bindings[:1])["worker_supabase_binding_types_valid"])
        self.assertFalse(inspect_studio_bindings(self.bindings + [self.bindings[0]])["worker_supabase_binding_types_valid"])
        self.assertFalse(inspect_studio_bindings([self.bindings[0],
            {"name": "SUPABASE_SERVICE_ROLE_KEY", "type": "plain_text", "text": "SECRET"}])["worker_supabase_binding_types_valid"])

    def test_url_is_exact_root_supabase_host(self):
        for invalid in (
            "http://" + "p"*20 + ".supabase.co",
            self.url + "/rest/v1",
            self.url + "/?token=secret",
            "https://" + "p"*20 + ".supabase.co.evil.example",
            "https://user:password@" + "p"*20 + ".supabase.co",
        ):
            self.assertIsNone(ref_from_url(invalid), invalid)


if __name__ == "__main__":
    unittest.main()
