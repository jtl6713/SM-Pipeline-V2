"""QA Home failure REST proof reads exact canonical pages, never publishes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = (ROOT / ".github/workflows/incident-2670-qa-indexed-rest-proof.yml").read_text(encoding="utf-8")
PS = (ROOT / ".github/scripts/incident-2670-qa-indexed-rest-ops.ps1").read_text(encoding="utf-8")


def test_exact_canonical_project_and_live_worker_source():
    assert "home_failure_candidate=eq.true" in PS
    assert "home_failure_candidate=eq.true" in WORKFLOW
    assert "QA_CENSUS_OUTPUT_SELECT" in WORKFLOW
    assert "test_run_id=is.null" in PS
    # Audit can check the .env URL, but cannot use an env-supplied host as a GET destination.
    assert any(line.startswith("  $uri='https://vkwvscgisqsbuwagdvtb.supabase.co/rest/v1/platform_outputs?") for line in PS.splitlines())
    assert "$uri=$base" not in PS


def test_three_nonpublishing_pages_and_duplicate_safety():
    assert "foreach($offset in @(0,100,200))" in PS
    assert "order=output_number.asc.nullslast,airtable_record_id.asc" in PS
    assert "HashSet[string]" in PS
    assert "indexed_qa_page_duplicate_or_invalid" in PS
    assert "PASS_247_DISTINCT_NO_WRITES" in PS
    assert "Invoke-RestMethod -Method Get" in PS
    assert "-TimeoutSec 16" in PS
    assert "timeout-minutes: 8" in WORKFLOW
    assert "OPS_DASHBOARD_TOKEN" in WORKFLOW
    assert "incident2670_indexed_qa_three_pages=PASS" in WORKFLOW


def test_existing_runner_role_never_logged_or_mutated():
    assert "SUPABASE_SERVICE_ROLE_KEY" in PS
    assert "Write-Output $secret" not in PS
    assert "cat /tmp/indexed-qa-status.json" not in WORKFLOW
    for forbidden in ("Invoke-RestMethod -Method Post", "Invoke-RestMethod -Method Patch",
                      "Invoke-RestMethod -Method Delete", "STUDIO_MAX_PRODUCER_JOBS=2",
                      "do_not_publish=false", "Set-Content", "Add-Content"):
        assert forbidden not in PS
