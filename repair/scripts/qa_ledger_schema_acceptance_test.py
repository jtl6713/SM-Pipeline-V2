"""Static guards for read-only QA ledger production security attestation.

Runs offline. The SQL itself can be run against the single production project
without creating tables, reading any QA rows or touching credentials.
"""
import re
import unittest
from pathlib import Path


FILE = (
    Path(__file__).resolve().parents[2]
    / "docs/supabase-migration/phase7/012_qa_ledger_verify_readonly.sql"
)


class QaLedgerAcceptanceSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = FILE.read_text(encoding="utf-8")
        cls.sql = re.sub(r"--[^\n]*", "", raw).strip()
        cls.source = raw

    def test_read_only_sql_one_select_statement(self):
        sql = self.sql
        self.assertTrue(sql.lower().startswith("with target("))
        self.assertEqual(sql.count(";"), 1)
        self.assertTrue(sql.rstrip().endswith(";"))
        # Reject adding DDL/DML at statement boundaries, not mentions of
        # privilege names inside literal strings and pg_catalog expressions.
        self.assertNotRegex(sql, r";\s*(?:drop|alter|create|delete|insert|update|truncate|grant|revoke|execute|call)\b")
        self.assertNotRegex(sql, r"\b(?:pg_sleep|dblink|pg_read_file|COPY|pg_execute_server_program)\b")

    def test_exact_ledger_objects_and_fail_closed_output(self):
        sql = self.sql
        for item in (
            "'studio_qa_runs'::text",
            "'studio_qa_events'::text",
            "'service_role'",
            "'anon'",
            "'authenticated'",
            "coalesce(rls_enabled,false)",
            "unique_identity",
            "unique_idempotency",
            "unique_legacy_source_identity",
            "event_references_runs",
            "studio_qa_events_run_id_fkey",
            "append_only_trigger",
            "legacy_provenance_atomic",
            "hash_rule",
            "qa_table_ready",
            "table_oid is not null",
            "to_regprocedure('public.studio_qa_reject_mutation()')",
        ):
            self.assertIn(item, sql)

    def test_security_denies_anonymous_and_authenticated_mutations(self):
        sql = self.sql
        for role in ("anon", "authenticated"):
            for op in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                self.assertIn(
                    f"has_table_privilege('{role}', d.table_oid, '{op}')", sql
                )
        for op in ("SELECT", "INSERT", "UPDATE", "DELETE"):
            self.assertIn(
                f"has_table_privilege('service_role', d.table_oid, '{op}')", sql
            )
        self.assertIn("not service_update and not service_delete", sql)
        self.assertIn("direct_rls_policy_count=0", sql)

    def test_no_migration_approval_can_be_derived_from_schema(self):
        self.assertIn(
            "never release approval", self.source.lower()
        )
        self.assertNotIn("release_authorized", self.sql.lower())


if __name__ == "__main__":
    unittest.main()
