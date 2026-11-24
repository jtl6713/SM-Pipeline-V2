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
