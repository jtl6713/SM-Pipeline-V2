"""One-shot cross-host canary: only synthetic RPC leases, no publication."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WF = (ROOT/".github/workflows/incident-2670-crosshost-runtime-canary.yml").read_text()
PS = (ROOT/".github/scripts/incident-2670-crosshost-python-canary.ps1").read_text()
JS = (ROOT/".github/scripts/incident-2670-crosshost-node-client.mjs").read_text()

def test_both_actual_clients_and_real_windows_code():
    assert 'globalWorkloadRpc' in JS and 'globalWorkloadKey' in JS
    assert 'from studio_produce import global_coordinator as g' in PS
    assert "g.acquire(" in PS and "g.release(" in PS
    assert "mode not in" in WF
    assert "mode -notin" in PS
    assert "node .github/scripts/incident-2670-crosshost-node-client.mjs acquire" in WF
    assert "submit_windows deny" in WF
    assert "submit_windows hold" in WF
    assert "client=FAILED_NO_PUBLISH" in WF

def test_global_root_fencing_and_no_production_mutations():
    assert '.[0].max_active==1' in WF
    assert 'scope=p_scope' not in WF
    assert "studio_global_workload_scopes" in WF
    assert "studio_write_source==\"supabase\"" in WF
    assert "airtable_activity.any_activity==false" in WF
    assert "crosshost_node_lease_cleanup=UNCONFIRMED_TTL180" in WF
    assert 'GlobalWorkload' not in PS
    for source in (WF, PS, JS):
        for forbidden in ('do_not_publish=false','STUDIO_MAX_PRODUCER_JOBS=2',
                          'NATIVE_GALLERY_AUTO_EXECUTE_ENABLED=true',
                          'RENDERING_REVIEW_AUTO_DISPATCH_ENABLED=true',
                          'STUDIO_SIDE_EFFECT_OUTBOX_ENABLED=true'):
            assert forbidden not in source

def test_no_secrets_in_synthetic_client_receipts():
    assert "Write-Output $sbKey" not in PS
    assert "console.log(env." not in JS
    assert "cat /tmp/crosshost-ops-status.json" not in WF
    assert "Read-BooleanSetting" not in PS
