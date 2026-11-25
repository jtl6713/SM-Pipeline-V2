import json
from unittest.mock import Mock

import pytest

from audio.voiceover_duration import measured_voiceover_seconds, voiceover_url
from r4.render_request import duration_is_explicit, render_voiceover_text
from studio_produce import story_voiceover as story


def output(**patch):
    return {"id": "recStory", "fields": {
        "Studio_Output_Type": "Story",
        "Studio_Effective_Voiceover_Mode": "Yes",
        "Output_Filename": "studio-story.mp4",
        "Render_Total_Frames": 300,
        "Selected_Assets_JSON": json.dumps({"target_total_frames":300}),
        **patch,
    }}


def parent():
    return {"id":"recParent","fields":{
        "Voiceover_URL":"https://example.test/full.mp3",
        "Voiceover_Duration_Seconds":41.889,
        "Voiceover_Script":"The river comes alive. This is the rest of the long script.",
        "Voice_ID":"voice-1",
    }}


def test_story_intent_and_parent_fallback_are_independent():
    assert story.needs_story_voiceover(output())
    assert not story.needs_story_voiceover(output(Studio_Effective_Voiceover_Mode="No"))
    assert not story.needs_story_voiceover(output(Output_Filename="legacy.mp4"))
    assert story.story_seconds(output())==10
    assert duration_is_explicit(output())
    assert voiceover_url(output(),parent())==""
    assert measured_voiceover_seconds(output(),parent(),probe=False) is None
    assert render_voiceover_text(output(),parent())==""
    full=output(Studio_Output_Type="Reel")
    assert voiceover_url(full,parent()).endswith("full.mp3")
    assert measured_voiceover_seconds(full,parent(),probe=False)==41.889


def test_story_text_is_complete_and_revision_bound():
    text=story.story_text(parent()["fields"]["Voiceover_Script"])
    assert text=="The river comes alive."
    with pytest.raises(story.StoryVoiceoverError):
        story.story_text("an incomplete sentence")
    a=story.fingerprint("recParent","voice-1",text,10)
    assert a!=story.fingerprint("recParent","voice-2",text,10)
    assert a!=story.fingerprint("recParent","voice-1",text,12)
    assert a!=story.fingerprint("recParent","voice-1","The city awakens.",10)
    row=output(Studio_Story_Voiceover_Receipt_JSON=json.dumps({"text":text}))
    assert render_voiceover_text(row,parent())==text


def test_story_accepts_only_audible_narration_with_room_to_finish(monkeypatch):
    monkeypatch.setattr(story,"probe_audio_duration_bytes",lambda _:9.7)
    monkeypatch.setattr(story,"probe_max_volume_db",lambda _:-8)
    assert story.checked_voice(b"audio",10)==9.7
    monkeypatch.setattr(story,"probe_audio_duration_bytes",lambda _:9.94)
    with pytest.raises(story.StoryVoiceoverError):
        story.checked_voice(b"audio",10)
    monkeypatch.setattr(story,"probe_audio_duration_bytes",lambda _:None)
    with pytest.raises(story.StoryVoiceoverError):
        story.checked_voice(b"audio",10)
    monkeypatch.setattr(story,"probe_audio_duration_bytes",lambda _:41.889)
    with pytest.raises(story.StoryVoiceoverError):
        story.checked_voice(b"audio",10)
    monkeypatch.setattr(story,"probe_audio_duration_bytes",lambda _:7)
    monkeypatch.setattr(story,"probe_max_volume_db",lambda _:-70)
    with pytest.raises(story.StoryVoiceoverError):
        story.checked_voice(b"audio",10)


def test_explicit_short_existing_audio_preserves_user_choice(monkeypatch):
    client=Mock()
    row=output(Voiceover_URL="https://example.test/short.mp3")
    monkeypatch.setattr(story,"probe_audio_duration_url",lambda _:7.5)
    assert story.ensure_story_voiceover(client,row,parent()) is row
    client.update_record.assert_not_called()
    monkeypatch.setattr(story,"probe_audio_duration_url",lambda _:41.889)
    with pytest.raises(story.StoryVoiceoverError):
        story.ensure_story_voiceover(client,row,parent())
    client.update_record.assert_not_called()


def test_story_sibling_failed_generation_fences_second_paid_call(monkeypatch):
    import copy
    from contextlib import nullcontext
    from types import SimpleNamespace
    from airtable.constants import CONTENT_ITEMS_TABLE
    from studio_produce import context, workload_governor
    from p2 import elevenlabs_client

    p = parent()
    a = output(Content_Item=[p["id"]])
    b = {**output(Content_Item=[p["id"]]), "id": "recSibling"}
    rows = {a["id"]: copy.deepcopy(a), b["id"]: copy.deepcopy(b)}

    class Client:
        def get_record(self, table, rid):
            return copy.deepcopy(p if table == CONTENT_ITEMS_TABLE else rows[rid])
        def update_record(self, table, rid, patch, **kwargs):
            rows[rid]["fields"].update(patch)

    client = Client()
    monkeypatch.setattr(context, "load_outputs", lambda *_: copy.deepcopy(list(rows.values())))
    monkeypatch.setattr(workload_governor, "enabled", lambda: True)
    monkeypatch.setattr(workload_governor, "resource_slot", lambda *a, **k: nullcontext())
    monkeypatch.setattr(elevenlabs_client, "resolve_content_voice_id", lambda _: "voice-1")
    synthesize = Mock(side_effect=RuntimeError("ambiguous provider timeout"))
    monkeypatch.setattr(elevenlabs_client, "synthesize_voiceover_by_id", synthesize)
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings
    monkeypatch.setattr(item_settings,"pipeline_settings",lambda *_:{})
    monkeypatch.setattr(R2UploadClient,"story_audio_exists",lambda *_:False)
    with pytest.raises(story.StoryVoiceoverError, match="reconcile its exact attempt"):
        story.ensure_story_voiceover(client, a, p)
    assert json.loads(rows[a["id"]]["fields"][story.RECEIPT])["state"] == "failed"
    with pytest.raises(story.StoryVoiceoverError, match="already recorded on a sibling"):
        story.ensure_story_voiceover(client, b, p)
    assert synthesize.call_count == 1


def test_story_cache_requires_one_exact_prepared_or_verified_checksum(monkeypatch):
    import hashlib
    data = b"normalized-audio"
    sha = hashlib.sha256(data).hexdigest()
    monkeypatch.setattr(story, "checked_voice", lambda data, cap: 5.25)
    assert story.verified_cached_voice(data, [{"state": "prepared", "sha256": sha}], 10) == 5.25
    assert story.verified_cached_voice(data, [{"state": "verified", "sha256": sha},
        {"state": "failed"}], 10) == 5.25
    with pytest.raises(story.StoryVoiceoverError, match="checksum"):
        story.verified_cached_voice(data, [], 10)
    with pytest.raises(story.StoryVoiceoverError, match="checksum"):
        story.verified_cached_voice(data, [{"sha256": sha}, {"sha256": "0" * 64}], 10)
    with pytest.raises(story.StoryVoiceoverError, match="checksum"):
        story.verified_cached_voice(b"replaced-audio", [{"sha256": sha}], 10)


def test_story_snapshot_rejects_parent_or_render_owner_change():
    row = output(Content_Item=["recParent"])
    snapshot = story.exact_story_snapshot(row, "recParent")
    assert story.exact_story_snapshot(output(Content_Item=["recParent"], Voiceover_URL="changed"), "recParent") != snapshot
    with pytest.raises(story.StoryVoiceoverError):
        story.exact_story_snapshot(row, "recOther")
    with pytest.raises(story.StoryVoiceoverError):
        story.exact_story_snapshot(output(Content_Item=["recParent"], Remotion_Job_ID="new-job"), "recParent")


def test_story_sibling_scan_refuses_partial_parent_set(monkeypatch):
    from studio_produce import context
    monkeypatch.setattr(context, "load_outputs", lambda *_: [])
    with pytest.raises(story.StoryVoiceoverError, match="sibling claim set"):
        story.matching_story_claims(Mock(), parent(), "recStory", "digest", "https://example.test/voice")


def test_rearm_story_missing_sentence_only_after_current_input_is_valid():
    from copy import deepcopy
    from airtable.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE

    p = parent()
    row = output(
        Content_Item=[p["id"]], Output_Status="In Production",
        Render_Status="Blocked", Remotion_Error_Message=story.STORY_MISSING_SENTENCE,
        Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]',
        Review_Status="Pending Review", Do_Not_Publish=False, Auto_Publish_Enabled=False,
    )
    rows = {row["id"]: deepcopy(row), p["id"]: deepcopy(p)}

    class Client:
        def __init__(self):
            self.writes = []
        def get_record(self, table, rid):
            return deepcopy(rows[rid])
        def update_record(self, table, rid, patch, **kwargs):
            self.writes.append((table, rid, patch))
            rows[rid]["fields"].update(patch)

    client = Client()
    assert story.story_sentence_recovery_candidate(row, p)
    invalid_parent = deepcopy(p)
    invalid_parent["fields"]["Voiceover_Script"] = "unfinished narration"
    assert not story.story_sentence_recovery_candidate(row, invalid_parent)
    for patch in (
        {"Output_Status":"Approved for Publishing"}, {"Do_Not_Publish":True},
        {"Auto_Publish_Enabled":True}, {"Review_Status":"Approved"},
        {"Remotion_Job_ID":"job-1"}, {"Final_File_URL":"https://example.test/file"},
        {"Platform_Post_ID":"provider-1"}, {"Publish_Attempt_Count":1},
        {story.RECEIPT:json.dumps({"state":"failed"})},
        {"Remotion_Error_Message":"unrelated guard"}, {"Composition_ID":""},
    ):
        other = deepcopy(row)
        other["fields"].update(patch)
        assert not story.story_sentence_recovery_candidate(other,p), patch
    # A changed live script cannot be rearmed from a stale snapshot.
    rows[p["id"]] = invalid_parent
    assert story.rearm_story_sentence_guard(client,row,p)["fields"]["Render_Status"] == "Blocked"
    assert client.writes == []
    rows[p["id"]] = deepcopy(p)
    result = story.rearm_story_sentence_guard(client,row,p)
    assert result["fields"]["Render_Status"] == "Ready for Render"
    assert client.writes == [(PLATFORM_OUTPUTS_TABLE,row["id"],{"Render_Status":"Ready for Render"})]
    # The original error remains until normal R4 validates and clears it.
    assert result["fields"]["Remotion_Error_Message"] == story.STORY_MISSING_SENTENCE


@pytest.mark.parametrize("status", [404, 403, 503, 200])
def test_cache_only_never_regenerates_missing_or_mismatched_story(monkeypatch,status):
    from contextlib import nullcontext
    from types import SimpleNamespace
    from studio_produce import workload_governor, context
    from p2 import elevenlabs_client
    p = parent()
    digest=story.fingerprint(p["id"],"voice-1",story.story_text(p["fields"]["Voiceover_Script"]),story.story_seconds(output()))
    url=f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"
    row = output(Content_Item=[p["id"]],Studio_Story_Voiceover_Receipt_JSON=json.dumps({"state":"failed","fingerprint":digest,"url":url,"sha256":"a"*64}))
    client = Mock()
    client.get_record.side_effect = lambda table,rid: p if rid == p["id"] else row
    monkeypatch.setattr(workload_governor,"enabled",lambda: True)
    monkeypatch.setattr(workload_governor,"resource_slot",lambda *a,**k:nullcontext())
    monkeypatch.setattr(elevenlabs_client,"resolve_content_voice_id",lambda _: "voice-1")
    paid = Mock(side_effect=AssertionError("must not regenerate"))
    monkeypatch.setattr(elevenlabs_client,"synthesize_voiceover_by_id",paid)
    monkeypatch.setattr(context,"load_outputs",lambda *_:[row])
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings
    monkeypatch.setattr(item_settings,"pipeline_settings",lambda *_:{})
    def read(*_):
        if status!=200: raise RuntimeError(f"storage status {status}")
        return b"unverified"
    monkeypatch.setattr(R2UploadClient,"read_story_audio",read)
    with pytest.raises(story.StoryVoiceoverError):
        story.ensure_story_voiceover(client,row,p,allow_generate=False)
    paid.assert_not_called()
    client.update_record.assert_not_called()


def test_cache_only_rearm_verified_bytes_without_paid_generation(monkeypatch):
    import hashlib
    from copy import deepcopy
    from contextlib import nullcontext
    from types import SimpleNamespace
    from studio_produce import workload_governor, context
    from p2 import elevenlabs_client
    p = parent()
    data=b"normalized"
    text=story.story_text(p["fields"]["Voiceover_Script"])
    digest=story.fingerprint(p["id"],"voice-1",text,story.story_seconds(output()))
    url="https://media.chicagoshining.com/studio/previews/story-voiceover/"+p["id"]+"/"+digest+".mp3"
    row=output(Content_Item=[p["id"]], Output_Status="In Production", Render_Status="Blocked",
        Remotion_Error_Message="Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
        Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]',
        Studio_Story_Voiceover_Receipt_JSON=json.dumps({"fingerprint":digest,"state":"failed","url":url,"sha256":hashlib.sha256(data).hexdigest()}))
    rows={p["id"]:p,row["id"]:row}
    class Client:
        def get_record(self,table,rid):
            return deepcopy(rows[rid])
        def update_record(self,table,rid,patch,**kw):
            rows[rid]["fields"].update(patch)
    client=Client()
    monkeypatch.setattr(workload_governor,"enabled",lambda: True)
    monkeypatch.setattr(workload_governor,"resource_slot",lambda *a,**k:nullcontext())
    monkeypatch.setattr(elevenlabs_client,"resolve_content_voice_id",lambda _: "voice-1")
    paid=Mock(side_effect=AssertionError("must not regenerate"))
    monkeypatch.setattr(elevenlabs_client,"synthesize_voiceover_by_id",paid)
    monkeypatch.setattr(context,"load_outputs",lambda *_:[deepcopy(row)])
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings
    monkeypatch.setattr(item_settings,"pipeline_settings",lambda *_:{})
    monkeypatch.setattr(R2UploadClient,"read_story_audio",lambda *_:data)
    monkeypatch.setattr(story,"checked_voice",lambda b,cap:4.0)
    result=story.rearm_story_sentence_guard(client,deepcopy(row),p)
    assert result["fields"]["Render_Status"]=="Ready for Render"
    assert result["fields"]["Voiceover_URL"]==url
    assert json.loads(result["fields"][story.RECEIPT])["state"]=="verified"
    paid.assert_not_called()

def test_held_cache_recovery_is_exact_and_preserves_hold():
    p=parent()
    p["id"]="rec9qS53G7HDoyCL5"
    row=output(Content_Item=[p["id"]],Output_Status="In Production",Render_Status="Blocked",
        Remotion_Error_Message="Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
        Composition_ID="Story",Render_Clip_List_JSON='[{"durationFrames":300}]',
        Do_Not_Publish=True,Auto_Publish_Enabled=False)
    row["id"]="recoheiAMq2vG48V3"
    assert story.story_sentence_recovery_candidate(row,p,cached_only=True)
    assert not story.story_sentence_recovery_candidate({**row,"id":"recUnrelated"},p,cached_only=True)
    assert not story.story_sentence_recovery_candidate({**row,"fields":{**row["fields"],"Auto_Publish_Enabled":True}},p,cached_only=True)
    assert not story.story_sentence_recovery_candidate({**row,"fields":{**row["fields"],"Production_Approved_At":"2026-11-25"}},p,cached_only=True)


def test_private_story_render_source_requires_exact_verified_receipt():
    p=parent()
    p["id"]="rec9qS53G7HDoyCL5"
    digest="a"*64
    sha="b"*64
    url=f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"
    row=output(Content_Item=[p["id"]],Voiceover_URL=url,Studio_Story_Voiceover_Receipt_JSON=json.dumps(
        {"state":"verified","url":url,"fingerprint":digest,"sha256":sha}))
    assert story.private_story_render_url(row,p)==f"http://127.0.0.1:3350/internal/story-audio/{p['id']}/{digest}/{sha}.mp3"
    row["fields"]["Voiceover_URL"]="https://example.test/wrong.mp3"
    with pytest.raises(story.StoryVoiceoverError):
        story.private_story_render_url(row,p)
