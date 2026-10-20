import unittest

from audit_airtable_egress_paths import scope


class ScopeTests(unittest.TestCase):
    def test_worker_gateway_and_shadow_are_instrumented(self):
        self.assertEqual(scope("apps/studio-api/worker.js")[0], "runtime_instrumented")
        self.assertEqual(scope("apps/studio-api/profile-summary-do.mjs")[0], "runtime_instrumented")

    def test_runner_http_monitor_instrumented(self):
        self.assertEqual(scope("services/pipeline-runner/airtable/egress_monitor.py")[0], "runtime_instrumented")

    def test_new_runtime_path_remains_blocking(self):
        self.assertEqual(scope("apps/studio-api/new-direct-fetch.mjs")[0], "production_runtime_unverified")
        self.assertEqual(scope("services/pipeline-runner/new_http_client.py")[0], "production_runtime_unverified")

    def test_staging_not_mistaken_for_runtime(self):
        self.assertEqual(scope("apps/studio-api/factory-batch-staging-worker.template.mjs")[0], "staging_only")

    def test_standalone_never_classified_as_proven(self):
        self.assertEqual(scope("services/pipeline-runner/scripts/find-smv1-test-target.py")[0], "standalone_unverified")
        self.assertEqual(scope("repair/scripts/prove-item9-native-covers.py")[0], "standalone_unverified")


if __name__ == "__main__":
    unittest.main()
