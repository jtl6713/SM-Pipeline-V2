import json
import unittest
from datetime import datetime, timezone
from urllib.parse import urlparse

from qa_production_backup_inventory import fetch_inventory, summarize_backups

REF = "vkwvscgisqsbuwagdvtb"
NOW = datetime(2026, 11, 21, 8, 0, tzinfo=timezone.utc)


def inventory(*, status="COMPLETED", timestamp="2026-11-21T05:00:00Z"):
    return {
        "region": "us-east-1", "walg_enabled": True, "pitr_enabled": False,
        "backups": [{"id": 14, "is_physical_backup": True,
                     "status": status, "inserted_at": timestamp}],
        "physical_backup_data": {},
    }


class Response:
    status = 200
    def __init__(self, document):
        self.data = json.dumps(document).encode("utf-8")
    def __enter__(self):
        return self
    def __exit__(self, *_):
        return False
    def read(self, length):
        return self.data[:length]


class ProductionBackupInventoryTests(unittest.TestCase):
    def test_bound_single_production_ref_get_only_never_restores(self):
        calls = []
        def requester(request):
            calls.append(request)
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(urlparse(request.full_url).netloc, "api.supabase.com")
            self.assertEqual(urlparse(request.full_url).path,
                "/v1/projects/" + REF + "/database/backups")
            self.assertEqual(request.get_header("Authorization"), "Bearer fake-token")
            return Response(inventory())
        result = fetch_inventory(REF, "fake-token", requester=requester, now=NOW)
        self.assertEqual(len(calls), 1)
        self.assertTrue(result["recent_completed_backup_observed"])
        self.assertFalse(result["restore_test_verified"])
        self.assertFalse(result["rollback_approved"])
        self.assertFalse(result["schema_apply_authorized"])
        self.assertFalse(result["worker_deploy_authorized"])

    def test_empty_failed_stale_and_future_backups_never_pass(self):
        for doc in (
            {**inventory(), "backups":[]},
            inventory(status="FAILED"),
            inventory(timestamp="2026-11-18T05:00:00Z"),
            inventory(timestamp="2026-11-22T05:00:00Z"),
        ):
            with self.subTest(doc=doc):
                self.assertFalse(summarize_backups(doc, now=NOW)["recent_completed_backup_observed"])

    def test_missing_secret_and_wrong_project_fail_before_network(self):
        with self.assertRaisesRegex(ValueError, "management token"):
            fetch_inventory(REF, "", now=NOW)
        with self.assertRaisesRegex(ValueError, "project"):
            fetch_inventory("another-project", "fake-token", now=NOW)

    def test_malformed_response_and_unavailable_provider_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "missing complete"):
            summarize_backups({"pitr_enabled":False}, now=NOW)
        with self.assertRaisesRegex(ValueError, "unavailable"):
            fetch_inventory(REF, "fake-token",
                requester=lambda request: (_ for _ in ()).throw(TimeoutError()),
                now=NOW)

    def test_no_claim_of_restorability_even_with_pitr(self):
        doc = inventory()
        doc["pitr_enabled"] = True
        result = summarize_backups(doc, now=NOW)
        self.assertTrue(result["pitr_enabled"])
        self.assertFalse(result["schema_apply_authorized"])


if __name__ == "__main__":
    unittest.main()
