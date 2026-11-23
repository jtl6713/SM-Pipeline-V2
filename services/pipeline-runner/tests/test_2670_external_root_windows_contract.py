"""Issue #2670 independent SQL root vs real Windows Python lease proof."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
WF=(ROOT/".github/workflows/incident-2670-external-root-windows.yml").read_text()
PS=(ROOT/".github/scripts/incident-2670-external-root-windows-denial.ps1").read_text()
def test_worker_claim_uses_canonical_runner_and_synthetic_id():
    assert "studio_produce import global_coordinator as g" in PS
    assert "incident2670-crosshost-python-synthetic-20261123-r2" in PS
    assert 'g.acquire("native_gallery", identity' in PS
    assert 'result.reason!="database_capacity"' in PS
    assert "DENIED_ROOT_CAP" in WF
    assert "print(2670)" in PS
    assert "WriteAllText($tempScript" in PS
    assert "Remove-Item -LiteralPath $tempScript -Force" in PS
    assert "$pythonExe $tempScript" in PS
    assert len(PS) < 8000
def test_safety_and_no_service_role_export():
    assert "SUPABASE_SERVICE_ROLE_KEY" in PS
    assert "SUPABASE_SERVICE_ROLE_KEY: ${{" not in WF
    assert "OPS_DASHBOARD_TOKEN" in WF
    assert ".airtable_activity.any_activity==false" in WF
    assert "Invoke-RestMethod -Method Post" not in PS
    for forbidden in ("STUDIO_MAX_PRODUCER_JOBS=2","do_not_publish=false","airtable.com", "STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED=true"):
        assert forbidden not in WF

def test_one_contiguous_failure_block_no_yaml_fragment_or_source_echo():
    assert WF.count("incident2670_external_sql_vs_windows_python=UNVERIFIED_FAIL_CLOSED") == 1
    assert WF.count("incident2670_external_sql_vs_windows_python=UNVERIFIED_TIMEOUT") == 1
    assert WF.count("grep -E '^incident2670_root_windows_class=") == 1
    assert "\n  | tail -1 || true" not in WF
    assert "tail -1 || true\n              echo" in WF
    assert "SUPABASE_SERVICE_ROLE_KEY: " not in WF
