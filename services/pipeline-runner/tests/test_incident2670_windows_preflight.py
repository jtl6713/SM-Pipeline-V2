"""Contract for #2670 read-only protected Windows coordinator diagnostics."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PS = (ROOT / ".github/scripts/incident-2670-windows-runtime-preflight.ps1").read_text()
WF = (ROOT / ".github/workflows/incident-2670-windows-runtime-preflight.yml").read_text()


def test_only_diagnostic_preflight_without_claim_or_provider_side_effects():
    assert "incident2670_preflight_result=READY_FOR_SYNTHETIC_TEST" in PS
    assert "incident2670_preflight_result=INCOMPLETE_NO_CHANGES" in PS
    assert "from studio_produce import global_coordinator as g" in PS
    assert "callable(g.acquire)" in PS
    assert "incident2670_preflight_hello=PASS" in PS
    assert "Probe-Python" in PS
    assert "print(2670)" in PS
    assert "print(2673 if g.enabled()" in PS
    assert 'print("incident2670_preflight_hello=PASS")' not in PS
    assert "Get-Process -Name python,python3" in PS
    assert "WindowsApps" in PS
    assert "PythonCore" in PS
    assert "Get-CimInstance Win32_Process" in PS
    assert "incident2670_preflight_python_path_category=" in PS
    assert "global_coordinator as g" in PS
    assert "g.acquire(" not in PS
    assert "Invoke-RestMethod" not in PS
    assert "studio_global_workload_acquire" not in PS
    assert "SUPABASE_SERVICE_ROLE_KEY: " + chr(36) + "{{" not in WF


def test_workflow_is_explicit_marker_only_and_sanitizes_job_output():
    assert "paths: ['deploy/incident-2670-windows-runtime-preflight.txt']" in WF
    assert "OPS_DASHBOARD_TOKEN" in WF
    assert ".airtable_activity.any_activity==false" in WF
    assert "grep -E '^incident2670_preflight_" in WF
    assert "READY_FOR_SYNTHETIC_TEST" in WF
    assert "STUDIO_MAX_PRODUCER_JOBS=2" not in WF
    assert "len(command) < 8000" in WF
    assert len(PS) < 8000
    assert "do_not_publish=false" not in WF
