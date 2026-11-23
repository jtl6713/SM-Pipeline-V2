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
def test_safety_and_no_service_role_export():
    assert "SUPABASE_SERVICE_ROLE_KEY" in PS
    assert "SUPABASE_SERVICE_ROLE_KEY: ${{" not in WF
    assert "OPS_DASHBOARD_TOKEN" in WF
    assert ".airtable_activity.any_activity==false" in WF
    assert "Invoke-RestMethod -Method Post" not in PS
    for forbidden in ("STUDIO_MAX_PRODUCER_JOBS=2","do_not_publish=false","airtable.com", "STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED=true"):
        assert forbidden not in WF
