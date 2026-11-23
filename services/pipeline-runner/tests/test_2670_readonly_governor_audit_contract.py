"""Static side-effect contract for the approved production audit."""
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[3] / ".github" / "workflows" / "incident-2670-readonly-governor-consumer-audit.yml"
SCRIPT = Path(__file__).resolve().parents[3] / ".github" / "scripts" / "incident-2670-readonly-consumer-audit.ps1"


def test_audit_requires_governor_supabase_and_retired_archive():
    body = WORKFLOW.read_text(encoding="utf-8") + "\n" + SCRIPT.read_text(encoding="utf-8")
    assert "recovery_read_only==false" in body
    assert "workload_governor_enabled==true" in body
    assert "studio_write_source==\"supabase\"" in body
    assert "airtable_activity.any_activity==false" in body
    assert "STUDIO_SIDE_EFFECT_OUTBOX_ENABLED" in body
    assert "optional_outbox_must_remain_disabled" in body


def test_audit_reads_only_loopback_diagnostics():
    body = WORKFLOW.read_text(encoding="utf-8") + "\n" + SCRIPT.read_text(encoding="utf-8")
    assert "$root/admin/workload" in body
    assert "$root/jobs/rendering-review/dispatch-health" in body
    assert "$root/jobs/native-gallery/dispatch-health" in body
    assert "incident2670_audit=" in body
    assert "assert len(command)<8000" in body
    assert "Parser]::ParseFile" in body
    for forbidden in ("restart-one", "STUDIO_MAX_PRODUCER_JOBS=", "PIPELINE_RUNNER_RECOVERY_READ_ONLY=", 
                      "media_publish", "create_parent(", "/jobs/i1-durable", "Do_Not_Publish=false"):
        assert forbidden not in body
