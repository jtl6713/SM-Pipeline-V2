"""Static integrity checks for REVIEW-ONLY QA ledger DDL.

Never executes SQL or connects to the production Supabase database.
Prevents past accidental partial-string substitutions/duplicated migration
blocks from being represented as migration-ready.
"""
import re
import unittest
from pathlib import Path


SQL_PATH = Path(__file__).resolve().parents[2] / (
    "docs/supabase-migration/phase7/011_qa_ledger_review_only.sql"
)


class QaLedgerSqlReviewOnlyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SQL_PATH.read_text(encoding="utf-8")
        cls.sql = re.sub(r"--[^\n]*", "", cls.source)

    def test_single_complete_transaction_and_two_tables(self):
        s = self.sql.lower()
        self.assertEqual(len(re.findall(r"\bbegin\s*;", s)), 1)
        self.assertEqual(len(re.findall(r"\bcommit\s*;", s)), 1)
        self.assertEqual(len(re.findall(r"\bcreate\s+table\s+public\.studio_qa_runs\s*\(", s)), 1)
        self.assertEqual(len(re.findall(r"\bcreate\s+table\s+public\.studio_qa_events\s*\(", s)), 1)
        self.assertLess(s.index("begin;"), s.index("create table public.studio_qa_runs"))
        self.assertLess(s.index("create table public.studio_qa_events"), s.index("commit;"))
        self.assertEqual(len(re.findall(r"\bcreate\s+function\s+public\.studio_qa_reject_mutation", s)), 1)
        self.assertNotIn("\n or (legacy_record_id", s)

    def test_legacy_history_and_native_hash_contract_are_both_preserved(self):
        s = self.sql
        for prefix in ("run", "event"):
            self.assertIn(f"constraint studio_qa_{prefix}_hash check (", s)
            self.assertIn(f"constraint studio_qa_{prefix}_legacy_triple check (", s)
            self.assertIn("legacy_source_fields is not null", s)
            self.assertIn("legacy_row_sha256 is not null", s)
        self.assertEqual(s.count("payload_hash ~ '^[0-9a-f]{64}$'"), 2)
        self.assertEqual(s.count("legacy_row_sha256 ~ '^[0-9a-f]{64}$'"), 2)
        self.assertEqual(s.count("legacy_record_id is not null and length(payload_hash) between 1 and 200"), 2)

    def test_only_production_is_a_live_qa_environment(self):
        s = self.sql
        self.assertIn(
            "legacy_record_id is null and environment = 'production'", s
        )
        self.assertIn(
            "legacy_record_id is not null and environment in ('production','staging','development')", s
        )
        self.assertNotIn(
            "check (environment in ('production','staging','development'))", s
        )

    def test_service_role_only_routing_and_append_only_preflight(self):
        s = self.sql.lower()
        self.assertEqual(len(re.findall(r"\bbefore update or delete\b", s)), 2)
        self.assertEqual(len(re.findall(r"\benable row level security\b", s)), 2)
        self.assertIn("revoke all on public.studio_qa_runs, public.studio_qa_events", s)
        self.assertIn("grant select, insert on public.studio_qa_runs, public.studio_qa_events to service_role", s)
        self.assertNotIn("grant all", s)
        self.assertNotIn("security definer", s)
        self.assertNotIn("drop table", s)
        self.assertNotIn("truncate", s)
        self.assertNotIn("drop trigger", s)
        self.assertEqual(len(re.findall(r"\bcreate\s+trigger\b", s)), 2)

    def test_sql_has_balanced_single_quoted_tokens_and_no_unclosed_comment(self):
        s = self.sql
        self.assertEqual(s.count("'") % 2, 0)
        self.assertEqual(s.count("$qa_append_only$"), 2)
        self.assertEqual(s.count("/*"), 0)
        self.assertEqual(s.count("*/"), 0)


if __name__ == "__main__":
    unittest.main()
