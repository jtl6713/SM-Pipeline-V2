"""Read-only C5/C6 and Review flag inventory must not expose secrets."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDIT = (ROOT / ".github/scripts/incident-2670-readonly-consumer-audit.ps1").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github/workflows/incident-2670-readonly-governor-consumer-audit.yml").read_text(encoding="utf-8")

def test_dispatch_preconditions_read_booleans_only():
    for name in ("RENDERING_REVIEW_AUTO_DISPATCH_ENABLED",
                 "RENDERING_REVIEW_EXACT_RENDER_ENABLED",
                 "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED",
                 "NATIVE_GALLERY_RUNNER_EXECUTE_ENABLED",
                 "NATIVE_GALLERY_RUNNER_CLAIM_ENABLED",
                 "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED",
                 "STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED"):
        assert ("Read-BooleanSetting '"+name+"'") in AUDIT
    assert "consumer_flag_ambiguous" in AUDIT
    assert "global_coordinator_enabled_on_runner" in AUDIT
    assert "gallery_credentials_configured" in AUDIT

def test_config_and_secret_values_remain_unprinted():
    assert "summary=[ordered]" in AUDIT
    assert "review_auto_flag" in WORKFLOW
    assert "review_exact_flag" in WORKFLOW
    assert "gallery_credentials_configured" in WORKFLOW
    assert "optional_outbox_enabled==false" in WORKFLOW
    assert "Parser]::ParseFile" in WORKFLOW
    assert "cat /tmp/audit-safe.json" in WORKFLOW
    for forbidden in ("Set-Content", "Add-Content", "Restart-Service",
                      "Get-Content $envFile | Write-Output", "Write-Output $secret",
                      "Write-Host $secret"):
        assert forbidden not in AUDIT
