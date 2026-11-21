import unittest
from qa_retirement_preflight import inspect_qa_sources


class QaRetirementGateTest(unittest.TestCase):
    def test_legacy_qa_is_blocked_without_source_exceptions(self):
        result = inspect_qa_sources(
            'const x=airtableFetch();return {writeAuthority:"Airtable"};',
            'if(observation.source!=="Airtable")return {status:"Blocked"};',
            'return {writeAuthority:"Airtable",appendOnly:true};',
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])
        self.assertFalse(result["release_authorized"])
        self.assertGreaterEqual(len(result["blockers"]), 4)

    def test_supabase_qa_code_passes_without_manual_history_approval(self):
        result = inspect_qa_sources(
            'return {writeAuthority:"Supabase"};',
            'if(observation.source!=="Supabase")return {status:"Blocked"};',
            'return {writeAuthority:"Supabase",appendOnly:true};',
        )
        self.assertTrue(result["qa_supabase_source_gate_passed"])
        # Source audit must not be misrepresented as publishing approval.
        self.assertFalse(result["release_authorized"])
        self.assertTrue(result["read_only"])

    def test_retired_gateway_is_never_permitted(self):
        result = inspect_qa_sources(
            'return await airtableFetch(env,table)',
            'if(observation.source!=="Supabase")return {status:"Blocked"};',
            'return {writeAuthority:"Supabase"};',
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])
        self.assertTrue(any("gateway" in message for message in result["blockers"]))

    def test_supabase_authority_must_be_explicit(self):
        result = inspect_qa_sources(
            'return {writeAuthority:"Unknown"};',
            'return {status:"Completed"};',
            'return {appendOnly:true};',
        )
        self.assertFalse(result["qa_supabase_source_gate_passed"])


if __name__ == "__main__":
    unittest.main()
