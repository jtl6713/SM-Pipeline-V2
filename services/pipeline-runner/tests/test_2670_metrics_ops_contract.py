"""#2670: production metrics probe keeps credentials on Windows, does not mutate state."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PS = (ROOT / ".github/scripts/incident-2670-supabase-metrics-ops.ps1").read_text()
WF = (ROOT / ".github/workflows/incident-2670-supabase-metrics-readonly.yml").read_text()

def test_only_fixed_metric_get_and_on_host_secret():
    assert "$endpoint='https://vkwvscgisqsbuwagdvtb.supabase.co/customer/v1/privileged/metrics'" in PS
    assert "Invoke-WebRequest -Method Get" in PS
    assert "SUPABASE_METRICS_SECRET_KEY" in PS
    assert "$secret=Setting 'SUPABASE_METRICS_SECRET_KEY'" in PS
    assert "Setting 'SUPABASE_SECRET_KEY'" not in PS
    assert "Setting 'SUPABASE_SERVICE_ROLE_KEY'" not in PS
    assert "foreach($name in @(" not in PS
    assert "StartsWith('sb_secret_')" in PS
    assert "NEEDS_EXISTING_SB_SECRET" in PS
    assert "Basic " in PS
    assert "OPS_DASHBOARD_TOKEN" in WF
    assert "SUPABASE_SERVICE_ROLE_KEY: ${{" not in WF

def test_no_hidden_write_or_unsafe_activation():
    assert "PASS_TWO_READONLY_SAMPLES" in PS
    assert "node_memory_MemAvailable_bytes" in PS
    assert "node_memory_SwapFree_bytes" in PS
    assert "if($errors.Count -ne 0)" in WF
    assert "max_time" not in WF or "20" in WF
    for forbidden in ("Invoke-RestMethod -Method Post", "Invoke-WebRequest -Method Post",
                      "Set-Content", "Add-Content", "STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED=true",
                      "STUDIO_MAX_PRODUCER_JOBS=2", "do_not_publish=false"):
        assert forbidden not in PS


def test_owner_runbook_has_privilege_warning_and_does_not_store_secret():
    guide = (ROOT / "deploy/incident-2670-metrics-key-owner-runbook.md").read_text()
    assert "Project Settings → API Keys" in guide
    assert "service_role" in guide
    assert "not a metrics-only/read-only credential" in guide.lower()
    assert "SUPABASE_METRICS_SECRET_KEY=sb_secret_..." in guide
    assert "metrics key configured" in guide
    assert "GitHub Actions Secrets" in guide
