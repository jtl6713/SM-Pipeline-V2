"""Owner-approved #2876: routine runner deployment without incident-only marker.

Checks deployment eligibility, not permission to relax workload/publish safeguards.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/deploy-pipeline-runner-via-ops.yml"
CONFIG = ROOT / "services/pipeline-runner/config.py"


def test_new_runner_python_source_is_a_push_trigger_without_release_marker():
    text = WORKFLOW.read_text(encoding="utf-8")
    header = text.split("\npermissions:", 1)[0]
    assert "branches: [main]" in header
    assert "'services/pipeline-runner/*.py'" in header
    assert "'services/pipeline-runner/**/*.py'" in header
    assert "'services/pipeline-runner/requirements.txt'" in header
    assert header.rstrip().endswith("- '!services/pipeline-runner/tests/**'")
    assert "No special recovery-era marker is required." in header


def test_deploy_still_requires_tests_supabase_only_and_actual_live_version():
    text = WORKFLOW.read_text(encoding="utf-8")
    for critical in (
        "test_extreme_closeup_direction_2876.py",
        "Fail closed unless runner is Supabase-only",
        ".studio_write_source==\"supabase\"",
        ".airtable_activity.any_read==false",
        ".airtable_activity.any_write==false",
        "Refuse deployment from an obsolete main commit",
        "group: production-pipeline-runner",
        "cancel-in-progress: false",
        "Verify Pipeline Runner health",
        ".version==$expected",
        "production/pipeline-runner",
    ):
        assert critical in text, critical


def test_current_release_pins_a_verifiable_runner_cutover():
    version = CONFIG.read_text(encoding="utf-8")
    # This release advances the version without removing the #2876 prompt
    # safety tests or the live version comparison in the deploy workflow.
    assert 'PIPELINE_RUNNER_CODE_VERSION = "2026-11-24-2965-smv1-restart-safety-v1"' in version


def test_no_workload_settings_or_publish_holds_changed_by_deployment_workflow():
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "STUDIO_MAX_PRODUCER_JOBS=" not in text
    assert "STUDIO_GLOBAL_COORDINATOR_ENABLED=" not in text
    assert "Do_Not_Publish" not in text
    assert '"action":"deploy","service":"pipeline-runner","confirm":true' in text


def test_deploy_requires_exact_fresh_ops_commit_receipt():
    import importlib.util
    import pytest

    module_path = ROOT / ".github/scripts/verify-runner-deployment-receipt.py"
    spec = importlib.util.spec_from_file_location("runner_receipt", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sha = "a" * 40
    job = {"id": "fresh-job", "action": "deploy", "service": "pipeline-runner",
           "status": "ok", "exitCode": 0,
           "log": f"Approved commit: {sha}\\nPASS - controlled deployment completed and verified.\\nCommit:  {sha}\\n"}
    job["log"] = job["log"].replace("\\n", "\n")
    assert module.verify_receipt({"ok": True, "job": job}, "fresh-job", sha)["deployed_commit"] == sha

    for change in (
        {"id": "old-job"}, {"service": "other-service"}, {"status": "running"},
        {"exitCode": 1}, {"log": f"Approved commit: {sha}"},
        {"log": "PASS - controlled deployment completed and verified.\nCommit: " + "b"*40},
        {"log": job["log"] + "Commit: " + "b"*40},
    ):
        with pytest.raises(ValueError):
            module.verify_receipt({"ok": True, "job": {**job, **change}}, "fresh-job", sha)

    text = WORKFLOW.read_text(encoding="utf-8")
    assert 'verify-runner-deployment-receipt.py /tmp/job.json "$JOB" "$GITHUB_SHA"' in text
    assert "Main changed during preflight; no runner cutover submitted" in text
