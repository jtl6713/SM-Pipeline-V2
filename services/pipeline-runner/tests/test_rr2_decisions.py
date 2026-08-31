from datetime import datetime, timezone

from config import StageRequest
from rr2.constants import DECISION_CHANGES, PUBLISHER_START_SCENARIOS
from rr2.decisions import append_decision_note, decision_fields, normalize_decision
from rr2.publisher import MAKE_API_SETTINGS_FORMULA, orch_make_start_skipped
from stages.rr2 import run as run_rr2


def test_normalize_decision_accepts_aliases():
    assert normalize_decision("Approved") == "approved"
    assert normalize_decision("CHANGES") == "changes"
    assert normalize_decision("changes_requested") == "changes"
    assert normalize_decision("reject") == "rejected"
    assert normalize_decision("do_not_publish") == "do_not_publish"
    assert normalize_decision("do-not-publish") == "do_not_publish"
    assert normalize_decision("nope") is None
    assert normalize_decision("") is None


def test_approve_fields_match_make_4a():
    now = datetime(2026, 8, 23, 21, 5, tzinfo=timezone.utc)
    fields = decision_fields("approved", "existing note", now=now)
    assert fields["Auto_Publish_Enabled"] is True
    assert fields["Review_Status"] == "Approved"
    assert fields["Publish_Status"] == "Ready to Publish"
    assert fields["Output_Status"] == "Approved for Publishing"
    assert fields["Publish_Method"] == "Automated"
    assert fields["Review_Decision_At"].startswith("2026-08-23T21:05")
    assert "RR2 render review decision: Approved for Publishing at 2026-08-23 21:05." in fields["Output_Notes"]
    assert fields["Output_Notes"].startswith("existing note")


def test_facebook_approve_holds_auto_publish():
    fields = decision_fields("approved", "", platform="Facebook")
    assert fields["Auto_Publish_Enabled"] is False
    assert fields["Publish_Method"] == "Manual"
    assert fields["Output_Status"] == "Approved for Publishing"


def test_changes_reject_and_skip_fields_match_make():
    now = datetime(2026, 8, 23, 21, 5, tzinfo=timezone.utc)
    changes = decision_fields("changes", "", now=now)
    assert changes["Review_Status"] == "Changes Requested"
    assert changes["Output_Status"] == "Changes Requested"
    assert changes["Publish_Status"] == "Not Ready"
    assert changes["Render_Status"] == "Needs Changes"
    assert "Auto_Publish_Enabled" not in changes

    rejected = decision_fields("rejected", "", now=now)
    assert rejected["Do_Not_Publish"] is True
    assert rejected["Review_Status"] == "Rejected"
    assert rejected["Output_Status"] == "Rejected"

    skipped = decision_fields("do_not_publish", "", now=now)
    assert skipped["Do_Not_Publish"] is True
    assert skipped["Review_Status"] == "Skipped"
    assert skipped["Output_Status"] == "Skipped"


def test_note_matches_make_blank_prefix():
    now = datetime(2026, 8, 23, 21, 5, tzinfo=timezone.utc)
    note = append_decision_note("", "approved", now=now)
    assert note.startswith("\n\nRR2 render review decision:")


def test_publisher_settings_formula_matches_make():
    assert '{Setting_Name}="MAKE_API_BASE_URL"' in MAKE_API_SETTINGS_FORMULA
    assert '{Setting_Name}="MAKE_API_TOKEN"' in MAKE_API_SETTINGS_FORMULA
    ids = [item[0] for item in PUBLISHER_START_SCENARIOS]
    assert ids == [5864632, 5813561, 5806668]
    assert orch_make_start_skipped(5864632, {"stage_backend_ig_orch": "python"})
    assert orch_make_start_skipped(5864632, {"stage_backend_ig_orch": "make"})


def test_stage_skips_unknown_decision_without_airtable():
    result = run_rr2(
        StageRequest(output_record_id="recFAKEOUTPUT123", extra={"decision": "nope"})
    )
    assert result.status == "skipped"
    assert result.details["run"]["reason"] == "unknown_decision"


def test_stage_skips_missing_record_id():
    result = run_rr2(StageRequest(extra={"decision": DECISION_CHANGES}))
    assert result.status == "skipped"
    assert result.details["run"]["reason"] == "missing_record_id"


def test_stage_reads_record_id_from_email_query_shape():
    result = run_rr2(
        StageRequest.from_dict({"record_id": "recFAKEOUTPUT123", "decision": "nope"})
    )
    assert result.status == "skipped"
    assert result.details["run"]["reason"] == "unknown_decision"
