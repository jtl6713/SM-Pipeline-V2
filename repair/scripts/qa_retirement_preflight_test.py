import unittest
from qa_retirement_preflight import inspect_qa_sources


class QaRetirementGateTest(unittest.TestCase):
    def test_legacy_qa_requires_predeploy_block(self):
        result = inspect_qa_sources(
            'const x=airtableFetch();return {writeAuthority:"Airtable"};',
            'if(observation.source!=="Airtable")return {status:"Blocked"};',
            'return {writeAuthority:"Airtable",appendOnly:true};',
            False,
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])
        self.assertFalse(result["release_authorized"])
        self.assertGreaterEqual(len(result["blockers"]), 4)

    def test_source_migration_alone_cannot_self_approve_backfill(self):
        result = inspect_qa_sources(
            'return {writeAuthority:"Supabase"};',
            'if(observation.source!=="Supabase")return {status:"Blocked"};',
            'return {writeAuthority:"Supabase",appendOnly:true};',
            False,
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])
        self.assertTrue(any("backfill" in item for item in result["blockers"]))

    def test_synthetic_clean_code_and_operator_evidence_only_passes_source_gate(self):
        result = inspect_qa_sources(
            'return {writeAuthority:"Supabase"};',
            'if(observation.source!=="Supabase")return {status:"Blocked"};',
            'return {writeAuthority:"Supabase",appendOnly:true};',
            True,
        )
        self.assertTrue(result["qa_supabase_source_gate_passed"])
        self.assertFalse(result["release_authorized"])

    def test_legacy_gateway_cannot_be_waived_by_flag(self):
        result = inspect_qa_sources(
            'return await airtableFetch(env,table)',
            'if(observation.source!=="Airtable")return {status:"Blocked"};',
            'return {writeAuthority:"Supabase"};',
            True,
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])


if __name__ == "__main__":
    unittest.main()
