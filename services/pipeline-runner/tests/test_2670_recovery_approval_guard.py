"""Incident 2670: approved crops + platform plan must reach held production, not a dead Draft.

Hermetic: no Supabase, Airtable, provider, or external API calls.
"""
import copy
from contextlib import contextmanager

import pytest

from studio_produce.recovery_approval import (
    parse_recovery_promotion, validate_recovery_promotion_authority,
)

REQ = "recR4EQcshFZ4fNL0"
IDEA = "recHkyoKeALlfq2jM"
CONTENT_UUID = "00000000-0000-0000-0000-000000000001"
IDEA_UUID = "00000000-0000-0000-0000-000000000002"


def accepted():
    return {"extra": {
        "production_request_record_id": REQ, "record_id": IDEA,
        "action": "video_submit", "trigger_i4": True,
        "production_platforms": "Instagram,Facebook",
        "production_content_type": "Vertical Short Video",
        "video_duration": "30", "video_clip_count": "Auto",
    }}


def test_only_exact_approved_i3_shape_is_allowed():
    assert parse_recovery_promotion(accepted()) == (REQ, IDEA)
    for bad in [
        {"extra": {**accepted()["extra"], "action": "deleted"}},
        {"extra": {**accepted()["extra"], "trigger_i4": False}},
        {"extra": {**accepted()["extra"], "dry_run": True}},
        {"extra": {**accepted()["extra"], "record_id": "bad"}},
        {"extra": {**accepted()["extra"], "production_request_record_id": "bad"}},
        {"extra": {**accepted()["extra"], "batch_record_ids": [REQ]}},
        {"extra": {**accepted()["extra"], "decision": "deleted"}},
        {"extra": {**accepted()["extra"], "action": "studio_promote"}},
        {"extra": {**accepted()["extra"], "action": "studio_promote", "decision": "tune"}},
        {},
    ]:
        assert parse_recovery_promotion(bad) is None


def ready_fixture():
    specs = [
        {"platform":"Instagram", "output_type":"Reel", "aspect_ratio":"9:16"},
        {"platform":"Instagram", "output_type":"Story", "aspect_ratio":"9:16"},
        {"platform":"Facebook", "output_type":"Reel", "aspect_ratio":"9:16"},
        {"platform":"Facebook", "output_type":"Story", "aspect_ratio":"9:16"},
    ]
    fields = {
        "Request_Status":"Submitted", "Idea_Candidate":[IDEA],
        "Studio_Master_Asset_Status":"Ready",
        "Studio_Output_Plan_Status":"Ready",
        "Studio_Variant_Status":"Ready",
        "Studio_Output_Plan_JSON":{"items":specs},
        "Studio_Variant_Manifest_JSON":{"plan_complete":True,
            "plan_ready_count":8, "plan_target_count":8,
            "assets":[{"variants":{"9:16":{"google_drive_file_id":"source",
                                        "media_asset_record_id":"recABCDEFGHIJKLMN"}}}
                      for _ in range(8)]},
    }
    class Client:
        def get_record(self, table, record_id):
            if record_id == REQ: return {"id": REQ,"fields":fields}
            if record_id == IDEA:
                return {"id": IDEA, "fields":{"Candidate_Status":"Generated"}}
            raise AssertionError("unexpected record read")
    def rest(path):
        if path.startswith("production_requests?"):
            return [{"id":CONTENT_UUID, "idea_candidate_id":IDEA_UUID,
                    "promoted_content_item_id":None}]
        if path.startswith("idea_candidates?"): return [{"id":IDEA_UUID}]
        if path.startswith("production_request_outputs?"):
            return [{**spec, "platform_output_id":None} for spec in specs]
        raise AssertionError("unapproved database lookup")
    return fields, Client(), rest


def test_saved_four_platforms_and_ready_eight_crops_authorize_only_owner():
    fields, client, rest = ready_fixture()
    result = validate_recovery_promotion_authority(REQ, IDEA,client=client,rest=rest)
    assert result["enabled"] == 4
    assert result["idea_id"] == IDEA


@pytest.mark.parametrize("change", [
    ("Request_Status", "Draft"),
    ("Request_Status", "Promoted"),
    ("Studio_Master_Asset_Status", "Preparing"),
    ("Studio_Output_Plan_Status", "Preparing"),
    ("Studio_Variant_Status", "Preparing"),
    ("Idea_Candidate", ["recOTHER000000000"]),
    ("Promoted_Content_Item", ["recPROMOTED0000001"]),
    ("Test_Run_ID", "run-123"),
])
def test_missing_or_unowned_inputs_fail_before_i3_writes(change):
    fields,client,rest=ready_fixture()
    fields[change[0]]=change[1]
    with pytest.raises(ValueError):
        validate_recovery_promotion_authority(REQ,IDEA,client=client,rest=rest)


def test_incomplete_crop_manifest_rejected():
    fields,client,rest=ready_fixture()
    fields["Studio_Variant_Manifest_JSON"]["assets"][0]["variants"]["9:16"].pop("google_drive_file_id")
    with pytest.raises(ValueError, match="saved_variant_authority"):
        validate_recovery_promotion_authority(REQ,IDEA,client=client,rest=rest)


def test_output_plan_mismatch_or_preexisting_fk_is_rejected():
    fields,client,base_rest=ready_fixture()
    def mismatched(path):
        rows=base_rest(path)
        if path.startswith("production_request_outputs?"):
            rows[0]["output_type"]="Carousel"
        return rows
    with pytest.raises(ValueError, match="saved_plan_output_mismatch"):
        validate_recovery_promotion_authority(REQ,IDEA,client=client,rest=mismatched)
    def linked(path):
        rows=base_rest(path)
        if path.startswith("production_request_outputs?"):
            rows[0]["platform_output_id"]=CONTENT_UUID
        return rows
    with pytest.raises(ValueError, match="existing_platform_link"):
        validate_recovery_promotion_authority(REQ,IDEA,client=client,rest=linked)


def test_flask_recovery_acceptance_never_unfences_publisher(monkeypatch):
    import app as runner
    from config import StageResult
    from studio_produce import workload_governor
    from studio_produce import recovery_approval

    for k,v in {
        "PIPELINE_RUNNER_RECOVERY_READ_ONLY":"true",
        "STUDIO_WORKLOAD_GOVERNOR_ENABLED":"true",
        "PIPELINE_RUNNER_RECOVERY_PRODUCER_ONLY":"true",
        "PIPELINE_RUNNER_RECOVERY_PRODUCER_TARGET":"ALL",
        "I1_DURABLE_ENABLED":"false",
        "RENDERING_REVIEW_AUTO_DISPATCH_ENABLED":"false",
        "NATIVE_GALLERY_AUTO_EXECUTE_ENABLED":"false",
    }.items():
        monkeypatch.setenv(k,v)
    monkeypatch.setitem(runner.settings,"pipeline_runner_shared_secret","test-secret")
    seen=[]
    @contextmanager
    def lease(scope, **opts):
        seen.append(("lease",scope,opts))
        yield
    monkeypatch.setattr(workload_governor,"resource_slot",lease)
    monkeypatch.setattr(recovery_approval,"validate_recovery_promotion_authority",
                        lambda request_id, idea_id: seen.append(("authorized",request_id,idea_id)))
    def fake_handler(_):
        seen.append(("i3",))
        return StageResult(stage="i3",status="ok",
                           details={"run":{"i4":{"processed":True,"content_item_id":"recCONTENT00000001"}}})
    monkeypatch.setattr(runner,"get_handler",lambda stage:fake_handler)
    client=runner.app.test_client()
    headers={"X-Pipeline-Secret":"test-secret"}
    ok=client.post("/stages/i3",json=accepted(),headers=headers)
    assert ok.status_code==200,ok.get_json()
    assert ok.get_json()["recovery_approval_hold"] is True
    assert seen==[("lease","recovery_idea_promotion",{"limit":1}),
                  ("authorized",REQ,IDEA),("i3",)]
    for stage in ["publish_ig","publish_fb","publish_tt","publish_yt","i4","a4"]:
        denied=client.post("/stages/"+stage,json=accepted(),headers=headers)
        assert denied.status_code==503
    for extra in [{"action":"deleted"}, {"record_id":"bad"}, {"trigger_i4":False}]:
        invalid=accepted()
        invalid["extra"].update(extra)
        denied=client.post("/stages/i3",json=invalid,headers=headers)
        assert denied.status_code==503
    assert client.post("/stages/i3",json=accepted()).status_code==401
