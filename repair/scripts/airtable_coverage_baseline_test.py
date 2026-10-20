import unittest
from airtable_coverage_baseline import assess, REQUIRED

class CoverageBaselineTests(unittest.TestCase):
    def test_missing_sources_not_zero(self):
        x=assess({"sources":{}})
        self.assertEqual(set(x["missing_sources"]),set(REQUIRED))
        self.assertIsNone(x["net_saved_requests"])
    def test_observed_zero_requires_attestation(self):
        sources={s:{"instrumented":True,"expected_hours":["2026-10-20T10:00:00Z"],"hourly_attestations":{}} for s in REQUIRED}
        x=assess({"sources":sources})
        self.assertIn("runner",x["missing_hours"])
        for s in REQUIRED:
            sources[s]["hourly_attestations"]["2026-10-20T10:00:00Z"]={"collector_ok":True,"attempts":0}
        self.assertEqual(assess({"sources":sources})["missing_hours"],{})
    def test_equal_flags_never_claim_savings(self):
        p={"start_utc":"2026-10-18T00:00:00Z","end_utc":"2026-10-19T00:00:00Z",
           "source_universe":list(REQUIRED),"read_flags":{"home":False},
           "complete":True,"workload":{"outputs":100,"refreshes":10,"dirty_updates":20,"reconciliations":0},"total_attempts":500}
        q={**p,"start_utc":"2026-10-19T00:00:00Z","end_utc":"2026-10-20T00:00:00Z","total_attempts":100}
        x=assess({"sources":{}},p,q)
        self.assertEqual(x["baseline_eligibility"],"no_treatment_difference")
        self.assertIsNone(x["net_saved_requests"])
    def test_unmatched_workload_blocks_claim(self):
        p={"start_utc":"2026-10-18T00:00:00Z","end_utc":"2026-10-19T00:00:00Z",
           "source_universe":list(REQUIRED),"read_flags":{"home":True},
           "complete":True,"workload":{"outputs":100,"refreshes":10,"dirty_updates":20,"reconciliations":0},"total_attempts":500}
        q={**p,"start_utc":"2026-10-19T00:00:00Z","end_utc":"2026-10-20T00:00:00Z",
           "read_flags":{"home":False},"workload":{**p["workload"],"outputs":200}}
        self.assertEqual(assess({"sources":{}},p,q)["workload_comparability"],"workload_outside_10pct")

if __name__=="__main__":
    unittest.main()
