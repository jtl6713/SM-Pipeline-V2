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
            sources[s]["hourly_attestations"]["2026-10-20T10:00:00Z"]={"collector_ok":True,"complete":True,"attempts":0}
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
        p["source_revisions"]={name:"revision1" for name in REQUIRED}
        q["source_revisions"]={name:"revision1" for name in REQUIRED}
        p["workload"].update({"reads":100,"writes":100})
        q["workload"].update({"reads":100,"writes":100})
        self.assertEqual(assess({"sources":{}},p,q)["workload_comparability"],"workload_outside_10pct")


    def test_sparse_manifest_cannot_claim_complete_24h_coverage(self):
        from datetime import datetime, timedelta, timezone
        from airtable_coverage_baseline import source_hour_gaps
        stamp="2026-10-18T00:00:00Z"
        sources={key: {"instrumented": True,"expected_hours":[stamp],
                       "hourly_attestations": {stamp:{"collector_ok":True,"complete":True,"attempts":0}}}
                 for key in REQUIRED}
        baseline=self._period("2026-10-18T00:00:00Z","2026-10-19T00:00:00Z",True,500)
        candidate=self._period("2026-10-19T00:00:00Z","2026-10-20T00:00:00Z",False,300)
        result=assess({"sources":sources,"reconcile_attribution_observed":True,
                       "exclusive_source_attribution_verified":True},baseline,candidate)
        self.assertFalse(result["system_wide_complete"])
        self.assertIsNone(result["net_saved_requests"])
        self.assertEqual(len(result["missing_hours"]["runner"]),47)

    @staticmethod
    def _period(start,end,enabled,total):
        return {"start_utc":start,"end_utc":end,
                "source_universe":list(REQUIRED),
                "source_revisions":{source:"revision1" for source in REQUIRED},
                "read_flags":{"home":enabled},"complete":True,
                "workload":{"reads":50,"writes":50,"outputs":100,"refreshes":10,
                            "dirty_updates":20,"reconciliations":1},
                "total_attempts":total}

    def test_complete_48h_requires_exclusive_sources_and_reports_delta(self):
        from datetime import datetime,timedelta,timezone
        start=datetime(2026,10,18,tzinfo=timezone.utc)
        stamps=[(start+timedelta(hours=i)).strftime("%Y-%m-%dT%H:00:00Z")
                for i in range(48)]
        sources={key: {"instrumented":True,"expected_hours":stamps,
                       "hourly_attestations":{h:{"collector_ok":True,"complete":True,"attempts":0}
                                              for h in stamps}}
                 for key in REQUIRED}
        p=self._period(stamps[0],"2026-10-19T00:00:00Z",True,500)
        q=self._period("2026-10-19T00:00:00Z","2026-10-20T00:00:00Z",False,300)
        coverage={"sources":sources,"reconcile_attribution_observed":True,
                  "exclusive_source_attribution_verified":False}
        denied=assess(coverage,p,q)
        self.assertIsNone(denied["net_saved_requests"])
        coverage["exclusive_source_attribution_verified"]=True
        accepted=assess(coverage,p,q)
        self.assertEqual(accepted["net_saved_requests"],200)
        self.assertTrue(accepted["system_wide_complete"])
        sources["runner"]["hourly_attestations"][stamps[25]]["complete"]=False
        rejected=assess(coverage,p,q)
        self.assertFalse(rejected["system_wide_complete"])
        self.assertIn(stamps[25],rejected["missing_hours"]["runner"])

    def test_partial_and_missing_revision_windows_never_qualify(self):
        p=self._period("2026-10-18T00:30:00Z","2026-10-19T00:30:00Z",True,500)
        q=self._period("2026-10-19T00:30:00Z","2026-10-20T00:30:00Z",False,300)
        result=assess({"sources":{}},p,q)
        self.assertEqual(result["baseline_eligibility"],"unaligned_or_short_windows")
        p=self._period("2026-10-18T00:00:00Z","2026-10-19T00:00:00Z",True,500)
        q=self._period("2026-10-19T00:00:00Z","2026-10-20T00:00:00Z",False,300)
        del p["source_revisions"]
        self.assertEqual(assess({"sources":{}},p,q)["baseline_eligibility"],"source_revision_unverified")

if __name__=="__main__":
    unittest.main()
