"""Incident 2670: the Review idle canary is bounded, reversible and nonpublishing."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PS = (ROOT / ".github/scripts/incident-2670-review-idle-toggle.ps1").read_text(encoding="utf-8")
YML = (ROOT / ".github/workflows/incident-2670-review-idle-canary.yml").read_text(encoding="utf-8")

def test_exact_empty_held_review_preflight_before_any_write():
    for needed in (
        "RENDERING_REVIEW_EXACT_RENDER_ENABLED",
        "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED",
        "rendering_review_jobs", "rendering_review_attempts",
        "review_ledger_not_empty_or_unverified", "review_preflight_runtime_not_idle",
        "STUDIO_SIDE_EFFECT_OUTBOX_ENABLED",
        "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED",
        "STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED",
        "max_jobs", "active_jobs", "queued_jobs", "paused_jobs",
    ):
        assert needed in PS

def test_only_flag_and_one_service_restart_with_rollback():
    assert "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED" in PS
    assert "WriteAllLines" in PS
    assert "review_flag_readback_unverified" in PS
    assert "ops_restart" in YML
    assert "rollback" in YML
    assert "ROLLED_BACK_FALSE" in YML
    assert "review_last_result==\"no_eligible_job\"" in YML
    assert "review_idle_canary=ENABLED_EMPTY_QUEUE_NO_DISPATCH" in YML
    assert "incident2670_review_flag=false" in YML

def test_no_gallery_publish_or_unbounded_processing():
    for unsafe in (
        "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED=true",
        "NATIVE_GALLERY_RUNNER_LAUNCH_ENABLED=true",
        "DO_NOT_PUBLISH=false", "do_not_publish=eq.false",
        "STUDIO_MAX_PRODUCER_JOBS=2",
        "SUPABASE_SIDE_EFFECT_OUTBOX_ENABLED=true",
    ):
        assert unsafe not in PS and unsafe not in YML
    assert "Parser]::ParseFile" in YML
    assert "optional_outbox_enabled==false" in YML
