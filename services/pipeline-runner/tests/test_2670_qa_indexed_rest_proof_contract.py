from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = (ROOT/".github/workflows/incident-2670-qa-indexed-rest-proof.yml").read_text(encoding="utf-8")

def test_exact_canonical_project_and_source():
    assert "https://vkwvscgisqsbuwagdvtb.supabase.co" in SOURCE
    assert "home_failure_candidate=eq.true" in SOURCE
    assert "QA_CENSUS_OUTPUT_SELECT" in SOURCE
    assert "test_run_id=is.null" in SOURCE

def test_three_read_only_no_duplicate_pagination():
    assert "for offset in 0 100 200" in SOURCE
    assert "'order=output_number.asc.nullslast,airtable_record_id.asc'" in SOURCE
    assert "sort -u /tmp/indexed-qa-ids.txt" in SOURCE
    assert "PASS_247_DISTINCT_NO_WRITES" in SOURCE
    assert 'Invoke-RestMethod -Method Get' in SOURCE\n    assert '-TimeoutSec 16' in SOURCE\n    assert 'OPS_DASHBOARD_TOKEN' in SOURCE
    assert 'timeout-minutes: 6' in SOURCE
    for forbidden in ("-X POST", "-X PATCH", "-X PUT", "-X DELETE",
                      "STUDIO_MAX_PRODUCER_JOBS=2", "do_not_publish=false"):
        assert forbidden not in SOURCE
