"""The one-shot #2853 probe stays exact, governed and nonpublishing."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = (ROOT / ".github/scripts/incident-2853-bryant-python-probe.ps1").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github/workflows/incident-2853-bryant-python-probe.yml").read_text(encoding="utf-8")


def test_exact_authorized_identity_and_single_governed_submission():
    assert "recbD8PLtJpez8Oz0" in SCRIPT
    assert "spj-7807a7691bb6" in SCRIPT
    assert "rectw2pvgnBzK3wCN" in SCRIPT and "recJ8jTynJDxsN0hl" in SCRIPT
    assert "10853" in SCRIPT and "10854" in SCRIPT
    assert SCRIPT.count("/jobs/studio-produce/resume") == 1
    assert SCRIPT.count("Invoke-RestMethod -Method POST") == 1
    assert "resume = $true" in SCRIPT


def test_fail_closed_cap_one_half_open_and_no_ambiguous_retry():
    for required in (
        "$work.max_jobs -eq 1",
        "$work.active_jobs -eq 0",
        "$work.queued_jobs -eq 0",
        "$work.paused_jobs -eq 0",
        "$work.active_worker_heavy -eq 0",
        "$resourceTotal -eq 0",
        "$work.database_circuit_phase -eq 'closed'",
        "$work.database_circuit_phase -ne 'half_open'",
        "Exactly one governed submission",
        "probe_settle_timeout_no_retry",
    ):
        assert required in SCRIPT
    assert "cancel-in-progress: false" in WORKFLOW
    assert "FAILED_NO_RETRY" in WORKFLOW and "TIMEOUT_NO_RETRY" in WORKFLOW


def test_human_review_and_external_action_fences_are_verified():
    for required in (
        "human_approval_required",
        "provider_writes",
        "Approved For Final",
        "Shared_Asset_Approved",
        "auto_publish_enabled",
        "studio_scheduled_at",
        "published_at",
        "platform_publish_response",
        "PASS_10853_10854_HUMAN_REVIEW_REQUIRED",
        "CAP1_ZERO_APPROVAL_SCHEDULE_PUBLISH",
    ):
        assert required in SCRIPT
    lowered = SCRIPT.lower()
    for forbidden in (
        "update production_requests",
        "update platform_outputs",
        "delete from governor_control",
        "approveoutputrecordforpublishing",
        "wrangler deploy",
    ):
        assert forbidden not in lowered


def test_ops_launch_preserves_exact_script_under_command_limit():
    for required in (
        "hashlib.sha256(source.read_bytes()).hexdigest()",
        "raw.githubusercontent.com/jtl6713/SM-Pipeline-V2/{commit}/",
        "Get-FileHash $tmp -Algorithm SHA256",
        "incident2853_pinned_source_hash_mismatch",
        "& $tmp -NormalClosedRecovery",
        "if len(command) > 7800:",
        "'command': command, 'confirm': True",
    ):
        assert required in WORKFLOW


def test_exact_preflight_runs_on_pr_but_production_access_does_not():
    assert "pull_request:" in WORKFLOW
    test_pos = WORKFLOW.index("Test exact gallery recovery and governor before production")
    exec_pos = WORKFLOW.index("Execute exactly one protected nonpublishing governed probe")
    assert test_pos < exec_pos
    assert "tests/test_2670_workload_governor.py" in WORKFLOW[test_pos:exec_pos]
    assert "OPS_TOKEN_A:" not in WORKFLOW[:exec_pos]
    assert "if: github.event_name == 'push' && github.ref == 'refs/heads/main'" in WORKFLOW[exec_pos:]


def test_normal_recovery_requires_closed_circuit_and_actual_i1_idleness():
    for required in (
        "param([switch]$NormalClosedRecovery, [switch]$GeometryRecovery",
        "$NormalClosedRecovery -and $work.database_circuit_phase -ne 'closed'",
        "incident2853_normal_resume_requires_closed_circuit",
        "Get-I1BusyCount",
        "I1_JOB_DB_PATH",
        "?mode=ro",
        "$i1Busy -eq 0",
        "PASS_NORMAL_RECOVERY_CIRCUIT_CLOSED",
        "scheduled_post_date",
    ):
        assert required in SCRIPT
    assert 'contains("incident2853_probe=PASS_NORMAL_RECOVERY_CIRCUIT_CLOSED") and contains(' in WORKFLOW
    assert 'contains("incident2853_probe=NOT_NEEDED_CIRCUIT_ALREADY_CLOSED")' not in WORKFLOW


def test_geometry_retry_is_exact_terminal_revision_and_corrected_source_bound():
    for required in (
        "$job.step -eq 'blocked'",
        "$job.error -eq 'Native gallery image geometry mismatch'",
        "$job.updated_at -eq '2026-11-25T00:26:21Z'",
        "[int]$job.heal.resume_count -eq 3",
        "$job.heal.last_resume_at -eq '2026-11-25T00:25:50.411Z'",
        "$job.heal.last_block_error -eq 'Native gallery image geometry mismatch'",
        "$actual -ne $ExpectedGallerySourceSha",
        "incident2853_geometry_recovery_deployed_source=PASS",
    ):
        assert required in SCRIPT
    assert "geometry_correction_not_on_main" in WORKFLOW
    assert "-GeometryRecovery -ExpectedGallerySourceSha" in WORKFLOW
    assert SCRIPT.count("Invoke-RestMethod -Method POST") == 1


def test_geometry_recovery_already_done_is_verified_without_post():
    start = SCRIPT.index("if ($GeometryRecovery -and $beforeRequest.production_job.step -eq 'done')")
    end = SCRIPT.index("  Assert-Baseline $beforeRequest $beforeOutputs", start)
    branch = SCRIPT[start:end]
    assert "Assert-Recovered $beforeRequest $beforeOutputs" in branch
    assert "incident2853_geometry_recovery=ALREADY_RECOVERED_NO_POST" in branch
    assert "exit 0" in branch
    assert "Invoke-RestMethod -Method POST" not in branch
    assert end < SCRIPT.index("Invoke-RestMethod -Method POST")
