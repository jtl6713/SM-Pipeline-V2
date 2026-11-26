"""Manual mode never acquires I4 authority from legacy approval or client extras."""
from pathlib import Path

import pytest

from airtable.constants import SOURCE_CANDIDATES_TABLE, CONTENT_ITEMS_TABLE
from i3 import processor as i3
from i4 import processor as i4
from production_mode_guard import explicit_manual_idea, verify_manual_submitted_owner
from supabase_reads import _record_from_row

IDEA = "rec00000000000001"
REQUEST = "rec00000000000002"
CONTENT = "rec00000000000003"
IDEA_UUID = "00000000-0000-4000-8000-000000000001"


def candidate(status="Generated", mode="manual", source="idea"):
    return {"id": IDEA, "fields": {"Candidate_Status": status,
        "Candidate_Title": "Test", "Studio_Production_Mode": mode,
        "Studio_Production_Source": source}}


def owner(**patch):
    return {"airtable_record_id": REQUEST, "idea_candidate_id": IDEA_UUID,
        "request_status": "Submitted", "promoted_content_item_id": None,
        "idea_candidates": {"id": IDEA_UUID, "airtable_record_id": IDEA,
            "production_mode": "manual", "production_source": "idea"}, **patch}


def test_typed_projection_never_grants_authority_from_payload():
    raw = {"airtable_record_id": IDEA, "status": "Generated",
        "payload": {"Studio_Production_Mode": "manual", "Studio_Production_Source": "idea"}}
    assert not explicit_manual_idea(_record_from_row(raw, SOURCE_CANDIDATES_TABLE))
    assert explicit_manual_idea(_record_from_row({**raw, "production_mode": "manual",
        "production_source": "idea"}, SOURCE_CANDIDATES_TABLE))
    assert not explicit_manual_idea(_record_from_row({**raw, "production_mode": "manual",
        "production_source": "finished_video"}, SOURCE_CANDIDATES_TABLE))


def test_exact_submitted_owner_read_is_fail_closed():
    calls = []
    def read(path):
        calls.append(path)
        return [owner()]
    assert verify_manual_submitted_owner(IDEA, REQUEST, rest=read)
    assert len(calls) == 1 and "idea_candidates!inner" in calls[0]
    assert not verify_manual_submitted_owner(IDEA, None, rest=read)
    assert len(calls) == 1
    for rows in ([], [owner(), owner()], [owner(request_status="Draft")],
                 [owner(idea_candidate_id="wrong")], [owner(promoted_content_item_id="already")],
                 [owner(idea_candidates={**owner()["idea_candidates"], "production_mode":"automatic"})],
                 [owner(idea_candidates={**owner()["idea_candidates"], "airtable_record_id":CONTENT})]):
        assert not verify_manual_submitted_owner(IDEA, REQUEST, rest=lambda _: rows)


class FakeClient:
    def __init__(self, row):
        self.row = row
        self.updates = []
        self.creates = []
    def get_record(self, table, record_id):
        assert table == SOURCE_CANDIDATES_TABLE and record_id == IDEA
        return self.row
    def update_record(self, table, record_id, fields, **kwargs):
        self.updates.append((table, record_id, fields))
        self.row["fields"].update(fields)
    def create_records(self, table, fields, **kwargs):
        self.creates.append((table, fields))
        return [{"id":CONTENT}]


def test_legacy_i3_accepts_idea_without_i4_even_with_spoofed_request(monkeypatch):
    client = FakeClient(candidate())
    monkeypatch.setattr(i3, "AirtableClient", lambda: client)
    monkeypatch.setattr(i3, "_trigger_i4", lambda *a, **k: pytest.fail("untrusted I4 launch"))
    result = i3.process_request(payload={"record_id":IDEA, "decision":"approved",
        "production_content_type":"Carousel", "production_request_record_id":REQUEST,
        "trusted_production_request_id":REQUEST})
    assert result["manual_production_required"] is True
    assert result["i4"]["skipped"] == "manual_production_review_required"
    assert client.updates[0][2]["Candidate_Status"] == "Approved"
    assert "Production_Content_Type" not in client.updates[0][2]
    assert not client.creates


def test_manual_approved_idea_legacy_retry_does_not_edit_or_promote(monkeypatch):
    client = FakeClient(candidate("Approved"))
    monkeypatch.setattr(i3,"AirtableClient",lambda:client)
    monkeypatch.setattr(i3,"_trigger_i4",lambda *a,**k:pytest.fail("I4 launch"))
    result=i3.process_request(payload={"record_id":IDEA,"decision":"approved"})
    assert result["reason"] == "manual_production_review_required"
    assert not client.updates and not client.creates


def test_trusted_i3_rejects_wrong_owner_before_any_write(monkeypatch):
    client=FakeClient(candidate())
    monkeypatch.setattr(i3,"AirtableClient",lambda:client)
    monkeypatch.setattr(i3,"verify_manual_submitted_owner",lambda *_:False)
    result=i3.process_request(payload={"record_id":IDEA,"decision":"approved"},trusted_production_request_id=REQUEST)
    assert result["reason"]=="manual_production_approval_unverified"
    assert not client.updates and not client.creates


def test_trusted_i3_forwards_verified_owner_to_i4(monkeypatch):
    client=FakeClient(candidate())
    monkeypatch.setattr(i3,"AirtableClient",lambda:client)
    monkeypatch.setattr(i3,"verify_manual_submitted_owner",lambda a,b:(a,b)==(IDEA,REQUEST))
    def trigger(record_id,payload,*,trigger,trusted_production_request_id):
        assert record_id==IDEA and trigger is True and trusted_production_request_id==REQUEST
        return {"content_item_id":CONTENT}
    monkeypatch.setattr(i3,"_trigger_i4",trigger)
    result=i3.process_request(payload={"record_id":IDEA,"decision":"approved"},trusted_production_request_id=REQUEST)
    assert result["i4"]["content_item_id"]==CONTENT
    assert len(client.updates)==1


def test_standalone_i4_cannot_promote_manual_and_fresh_read_fences_retry(monkeypatch):
    client=FakeClient(candidate("Approved"))
    monkeypatch.setattr(i4,"AirtableClient",lambda:client)
    monkeypatch.setattr(i4,"verify_manual_submitted_owner",lambda a,b:False)
    assert i4.process_request(record_id=IDEA)["reason"]=="manual_production_review_required"
    assert not client.creates
    outcomes=iter([True,False])
    monkeypatch.setattr(i4,"verify_manual_submitted_owner",lambda *_:next(outcomes))
    assert i4.process_request(record_id=IDEA,trusted_production_request_id=REQUEST)["reason"]=="manual_production_review_required"
    assert not client.creates


def test_verified_manual_approval_and_legacy_finish_remain_eligible(monkeypatch):
    for mode,source,owner_id in [("manual","idea",REQUEST),("automatic","idea",None),
                               ("automatic","finished_video",None),(None,None,None)]:
        client=FakeClient(candidate("Approved",mode,source))
        monkeypatch.setattr(i4,"AirtableClient",lambda:client)
        monkeypatch.setattr(i4,"verify_manual_submitted_owner",lambda a,b:(a,b)==(IDEA,REQUEST))
        result=i4.process_request(record_id=IDEA,trusted_production_request_id=owner_id)
        assert result["content_item_id"]==CONTENT
        assert len(client.creates)==1 and client.creates[0][0]==CONTENT_ITEMS_TABLE


def test_only_authenticated_stage_can_pass_private_owner_argument():
    root=Path(__file__).resolve().parents[1]
    app=(root/"app.py").read_text(encoding="utf-8")
    stage=app[app.index("def run_stage("):app.index("    status_code = 200",app.index("def run_stage("))]
    assert stage.index("_verify_secret()") < stage.index("parse_recovery_promotion(request.get_json")
    assert 'stage_name == "i3" and settings.get("pipeline_runner_shared_secret"' in stage
    assert "return handler(body, trusted_production_request_id=trusted_production_request_id)" in stage
    hook=app[app.index("def i3_email_hook("):app.index('@app.route("/hooks/a1p/')]
    assert "i3.run(body)" in hook and "trusted_production_request_id" not in hook
    i4stage=(root/"stages"/"i4.py").read_text(encoding="utf-8")
    assert "trusted_production_request_id" not in i4stage
