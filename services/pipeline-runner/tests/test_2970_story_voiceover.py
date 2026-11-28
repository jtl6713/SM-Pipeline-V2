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


@pytest.mark.parametrize('verified_cache_error', [False, True])
def test_cache_only_rearm_verified_bytes_without_paid_generation(monkeypatch, verified_cache_error):
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
    if verified_cache_error:
        row["fields"]["Remotion_Error_Message"]=story.STORY_VERIFIED_CACHE_ERROR
        claim=json.loads(row["fields"][story.RECEIPT])
        claim["state"]="verified"
        row["fields"][story.RECEIPT]=json.dumps(claim)
        assert story.story_sentence_recovery_candidate(row,p,cached_only=True)
        bad=deepcopy(row)
        claim.pop("sha256")
        bad["fields"][story.RECEIPT]=json.dumps(claim)
        assert not story.story_sentence_recovery_candidate(bad,p,cached_only=True)
        assert not story.story_sentence_recovery_candidate(row,p,cached_only=False)
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


@pytest.mark.parametrize("held", [True, False])
def test_recover_original_provider_history_preserves_hold_and_never_synthesizes(monkeypatch, held):
    import hashlib
    from copy import deepcopy
    from contextlib import nullcontext
    from studio_produce import workload_governor, context, story_history_recovery as history
    from p2 import elevenlabs_client, normalizer_client
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings

    p=parent()
    p["id"]="reccVyNLdmJJeI8hG"
    raw=b"original recording from history"
    data=b"normalized original recording"
    digest=story.fingerprint(p["id"],"voice-1",story.story_text(p["fields"]["Voiceover_Script"]),story.story_seconds(output()))
    url=f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"
    evidence={"fingerprint":digest,"created_at":1795576594,"sha256":hashlib.sha256(raw).hexdigest(),
              "outputs":{"recjqFCCxBroLyoQJ"}, "held":held}
    monkeypatch.setitem(history.HISTORY_RECOVERY,p["id"],evidence)
    row=output(Content_Item=[p["id"]],Output_Status="In Production",Render_Status="Blocked",
        Remotion_Error_Message="Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt",
        Composition_ID="Story",Render_Clip_List_JSON='[{"durationFrames":300}]',
        Do_Not_Publish=held,Auto_Publish_Enabled=False,
        Studio_Story_Voiceover_Receipt_JSON=json.dumps({"state":"failed","fingerprint":digest,"url":url}))
    row["id"]="recjqFCCxBroLyoQJ"
    rows={p["id"]:p,row["id"]:row}
    class Client:
        def get_record(self,table,rid):
            return deepcopy(rows[rid])
        def update_record(self,table,rid,patch,**kw):
            assert not {"Do_Not_Publish","Auto_Publish_Enabled","Output_Status","Review_Status"} & patch.keys()
            rows[rid]["fields"].update(patch)
    client=Client()
    monkeypatch.setattr(workload_governor,"enabled",lambda:True)
    monkeypatch.setattr(workload_governor,"resource_slot",lambda *a,**k:nullcontext())
    monkeypatch.setattr(elevenlabs_client,"resolve_content_voice_id",lambda _:"voice-1")
    paid=Mock(side_effect=AssertionError("no new synthesis"))
    monkeypatch.setattr(elevenlabs_client,"synthesize_voiceover_by_id",paid)
    monkeypatch.setattr(context,"load_outputs",lambda *_:[deepcopy(row)])
    monkeypatch.setattr(item_settings,"pipeline_settings",lambda *_:{})
    monkeypatch.setattr(history,"download_audited_history",lambda *a:raw)
    monkeypatch.setattr(normalizer_client,"normalize_voiceover",lambda *a,**k:({},data))
    monkeypatch.setattr(story,"checked_voice",lambda *a:4.0)
    objects={}
    monkeypatch.setattr(R2UploadClient,"story_audio_exists",lambda self,key:key in objects)
    monkeypatch.setattr(R2UploadClient,"put_object",lambda self,key,body,typ:objects.update({key:body}))
    monkeypatch.setattr(R2UploadClient,"read_story_audio",lambda self,key,sha:objects[key])
    result=story.rearm_story_sentence_guard(client,deepcopy(row),p)
    assert result["fields"]["Render_Status"]=="Ready for Render"
    assert result["fields"]["Do_Not_Publish"] is held
    assert result["fields"]["Auto_Publish_Enabled"] is False
    receipt=json.loads(result["fields"][story.RECEIPT])
    assert receipt["state"]=="verified"
    assert receipt["history_original_sha256"]==evidence["sha256"]
    assert receipt["sha256"]==hashlib.sha256(data).hexdigest()
    paid.assert_not_called()


def test_r4_snapshot_fences_changed_story_receipt_at_same_url(monkeypatch):
    from r4 import processor

    url = "https://example.test/story.mp3"
    receipt = {"state": "verified", "url": url, "sha256": "a" * 64}
    original = output(Voiceover_URL=url, Studio_Story_Voiceover_Receipt_JSON=json.dumps(receipt))
    changed = output(Voiceover_URL=url, Studio_Story_Voiceover_Receipt_JSON=json.dumps({**receipt, "sha256": "b" * 64}))
    removed = output(Voiceover_URL=url)
    snapshot = processor.render_snapshot_identity(original)
    monkeypatch.setattr(processor, "studio_revision_error", lambda *_: None)
    assert processor.render_snapshot_error(snapshot, None, original) is None
    assert processor.render_snapshot_error(snapshot, None, changed) is not None
    assert processor.render_snapshot_error(snapshot, None, removed) is not None


@pytest.mark.parametrize("mode,expected", [
    ("absent", "Ready for Render"), ("present", "Blocked"),
    ("unavailable", "Blocked"), ("claim", "Blocked"), ("stale", "Blocked"),
    ("verified_sibling", "Ready for Render"), ("corrupt_sibling", "Blocked"),
    ("unreadable_sibling", "Blocked"),
])
def test_storage_guard_recovery_requires_exact_absence_or_verified_cache(monkeypatch, mode, expected):
    from copy import deepcopy
    from contextlib import nullcontext
    from studio_produce import workload_governor, context
    from p2 import elevenlabs_client
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings
    p = parent()
    row = output(Content_Item=[p["id"]], Output_Status="In Production",
        Render_Status="Blocked", Remotion_Error_Message=story.STORY_STORAGE_GUARD,
        Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]',
        Review_Status="Pending Review", Do_Not_Publish=False, Auto_Publish_Enabled=False)
    rows = {p["id"]: deepcopy(p), row["id"]: deepcopy(row)}
    client = Mock()
    client.get_record.side_effect = lambda table, rid: deepcopy(rows[rid])
    def update(table, rid, patch, **kwargs):
        rows[rid]["fields"].update(patch)
    client.update_record.side_effect = update
    monkeypatch.setattr(workload_governor, "enabled", lambda: True)
    monkeypatch.setattr(workload_governor, "resource_slot", lambda *a, **k: nullcontext())
    monkeypatch.setattr(elevenlabs_client, "resolve_content_voice_id", lambda _: "voice-1")
    paid = Mock(side_effect=AssertionError("rearm may not synthesize"))
    monkeypatch.setattr(elevenlabs_client, "synthesize_voiceover_by_id", paid)
    monkeypatch.setattr(item_settings, "pipeline_settings", lambda *_: {})
    digest = story.fingerprint(p["id"], "voice-1", story.story_text(p["fields"]["Voiceover_Script"]), story.story_seconds(row))
    sibling = deepcopy(row)
    sibling["id"] = "recBBBBBBBBBBBBBB"
    sibling["fields"][story.RECEIPT] = json.dumps({"fingerprint":digest,"state":"failed","url":f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"})
    import hashlib
    cached = b"verified-story-audio"
    if mode.endswith("_sibling"):
        claim = json.loads(sibling["fields"][story.RECEIPT])
        claim.update(state="verified", sha256=hashlib.sha256(cached).hexdigest())
        sibling["fields"][story.RECEIPT] = json.dumps(claim)
    monkeypatch.setattr(context, "load_outputs", lambda *_: [row, sibling] if mode == "claim" or mode.endswith("_sibling") else [row])
    monkeypatch.setattr(story, "checked_voice", lambda *_: 4.0)
    def read_cache(*_):
        if mode == "unreadable_sibling":
            raise RuntimeError("cache unavailable")
        return b"wrong-story-audio" if mode == "corrupt_sibling" else cached
    monkeypatch.setattr(R2UploadClient, "read_story_audio", read_cache)
    def exists(*_):
        if mode == "unavailable":
            raise RuntimeError("storage unavailable")
        if mode == "stale":
            rows[row["id"]]["fields"]["Do_Not_Publish"] = True
        return mode == "present"
    monkeypatch.setattr(R2UploadClient, "story_audio_exists", exists)
    result = story.rearm_story_sentence_guard(client, row, p)
    assert result["fields"]["Render_Status"] == expected
    paid.assert_not_called()
    if expected == "Blocked":
        client.update_record.assert_not_called()
    else:
        assert client.update_record.call_count == 1
        assert rows[row["id"]]["fields"]["Do_Not_Publish"] is False


def exact_3159_context():
    p = parent()
    p["id"] = "rec9qS53G7HDoyCL5"
    ids = ["recmeqaimrNohhz3y", "recXKsz1oxOy8ooUn", "recgtoz6TcTHKgg00",
           "recVBua7DyEmUQs8X", "reccgtEdV1EKo4Hlp"]
    rows = [
        {"id": ident, "fields": {
            "Output_Status": "Approved for Publishing", "Review_Status": "Approved",
            "Render_Status": "Rendered", "Final_File_URL": "https://example.test/approved.mp4",
            "Studio_Output_Type": "Reel", "Aspect_Ratio": "9:16",
            "Voiceover_URL": "https://example.test/full.mp3",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Render_Clip_List_JSON": '[{"url":"https://example.test/image.jpg","durationFrames":1164}]',
            "Auto_Publish_Enabled": True, "Scheduled_Post_Date": "2026-12-06T04:06:00Z",
        }} for ident in ids
    ]
    digest = "0454c4863049a512c784d2964e74a587387baa5665a2753a1bb8f5b3c501c18d"
    sha = "e6d305b08797e5c83f5ee30104384e702573cfe0d352a8a078f6eee6df1982fb"
    url = f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"
    target = output(Content_Item=[p["id"]], Output_Status="Ready for Review",
        Render_Status="Rendered", Final_File_URL="https://example.test/story.mp4",
        Do_Not_Publish=True, Auto_Publish_Enabled=False, Publish_Status="Not Ready",
        Studio_Story_Voiceover_Receipt_JSON=json.dumps({"fingerprint":digest,"sha256":sha,"state":"verified","url":url}))
    target["id"] = "recoheiAMq2vG48V3"
    rows.append(target)
    return {"request_id":"recEDPsqJlxaGHCyO","request":{"fields":{}},
            "job":{"job_id":"spj-854f9cd1bdf8","route":"photo:scripted"},
            "parent":p,"outputs":rows}


def test_exact_3159_completed_story_does_not_propagate_into_approved_siblings(monkeypatch):
    from copy import deepcopy
    from studio_produce import steps
    ctx = exact_3159_context()
    before = deepcopy(ctx["outputs"])
    by_id = {r["id"]:r for r in before}
    client = Mock()
    client.get_record.side_effect = lambda table, ident: deepcopy(by_id[ident])
    monkeypatch.setattr(steps, "_output_missing_review_cover", lambda row: False)
    assert steps._verified_story_recovery_scope(ctx) == "recoheiAMq2vG48V3"
    assert steps.step_render(client, ctx) == "done"
    client.update_record.assert_not_called()
    assert ctx["outputs"] == before


@pytest.mark.parametrize("drift", ["hold","sibling_approval","receipt","sibling_cover"])
def test_exact_3159_story_recovery_fails_closed_on_scope_drift(monkeypatch, drift):
    from studio_produce import steps
    ctx = exact_3159_context()
    monkeypatch.setattr(steps, "_output_missing_review_cover",
                        lambda row: drift == "sibling_cover" and row["id"] == "recmeqaimrNohhz3y")
    if drift == "hold":
        ctx["outputs"][-1]["fields"]["Do_Not_Publish"] = False
    elif drift == "sibling_approval":
        ctx["outputs"][0]["fields"]["Review_Status"] = "Pending Review"
    elif drift == "receipt":
        ctx["outputs"][-1]["fields"][story.RECEIPT] = "{}"
    with pytest.raises(steps.StepBlocked):
        steps._verified_story_recovery_scope(ctx)

@pytest.mark.parametrize("request_id", ["recyGAoFNARh8msjb", "recv3RruCzNtq4bes"])
def test_3159_new_cached_story_scope_and_no_paid_fallback(monkeypatch, request_id):
    from studio_produce import steps
    ctx = exact_3159_context()
    job, pid, target, siblings = steps._EXACT_3159_CACHE_SCOPES[request_id]
    ctx["request_id"] = request_id
    ctx["job"]["job_id"] = job
    ctx["parent"]["id"] = pid
    for row, ident in zip(ctx["outputs"][:-1], sorted(siblings)):
        row["id"] = ident
    row = ctx["outputs"][-1]
    row["id"] = target
    url = f"https://media.chicagoshining.com/studio/previews/story-voiceover/{pid}/{'a'*64}.mp3"
    row["fields"].update(Content_Item=[pid], Output_Status="In Production", Render_Status="Blocked",
                         Review_Status="Pending Review", Remotion_Error_Message=next(iter(story.STORY_CACHE_ERRORS)),
                         Final_File_URL="", Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]')
    proof={"state":"failed","fingerprint":"a"*64,"sha256":"b"*64,"url":url}
    row["fields"][story.RECEIPT]=json.dumps(proof)
    monkeypatch.setattr(steps, "_output_missing_review_cover", lambda row: False)
    assert steps._verified_story_recovery_scope(ctx) == target
    assert story.story_sentence_recovery_candidate(row, ctx["parent"], cached_only=True)
    row["fields"][story.RECEIPT]="{}"
    client=Mock()
    with pytest.raises(story.StoryVoiceoverError, match="no new synthesis"):
        story.ensure_story_voiceover(client,row,ctx["parent"])
    client.update_record.assert_not_called()
    with pytest.raises(steps.StepBlocked):
        steps._verified_story_recovery_scope(ctx)
    row["fields"][story.RECEIPT]=json.dumps({**proof,"state":"verified"})
    row["fields"].update(Output_Status="Ready for Review",Render_Status="Rendered",Final_File_URL="https://example.test/story.mp4")
    assert steps._verified_story_recovery_scope(ctx)==target
    ctx["outputs"][0]["fields"]["Review_Status"]="Pending Review"
    with pytest.raises(steps.StepBlocked):
        steps._verified_story_recovery_scope(ctx)


@pytest.mark.parametrize("request_id", ["rec9iM9aQBPhA1e2q","recuuGJr8rUO5ZV4r"])
def test_3159_exact_history_pair_preserves_approved_scope(monkeypatch, request_id):
    from studio_produce import steps
    from studio_produce.story_history_recovery import HISTORY_RECOVERY
    ctx=exact_3159_context()
    jid,pid,siblings=steps._EXACT_3159_HISTORY_SCOPES[request_id]
    evidence=HISTORY_RECOVERY[pid]
    ctx["request_id"]=request_id
    ctx["job"]["job_id"]=jid
    ctx["parent"]["id"]=pid
    rows=ctx["outputs"][:4]
    for row,ident in zip(rows,sorted(siblings)): row["id"]=ident
    digest=evidence["fingerprint"]
    url=f"https://media.chicagoshining.com/studio/previews/story-voiceover/{pid}/{digest}.mp3"
    for i,ident in enumerate(sorted(evidence["outputs"])):
        row=output(Content_Item=[pid], Output_Status="In Production", Render_Status="Blocked",
                   Do_Not_Publish=True, Auto_Publish_Enabled=False, Publish_Status="Not Ready",
                   Remotion_Error_Message="Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt")
        row["id"]=ident
        if i==0: row["fields"][story.RECEIPT]=json.dumps({"fingerprint":digest,"url":url,"state":"failed"})
        rows.append(row)
    ctx["outputs"]=rows
    monkeypatch.setattr(steps,"_output_missing_review_cover",lambda _:False)
    assert steps._verified_story_recovery_scope(ctx)==frozenset(evidence["outputs"])
    rows[-1]["fields"]["Do_Not_Publish"]=False
    with pytest.raises(steps.StepBlocked): steps._verified_story_recovery_scope(ctx)
    rows[-1]["fields"]["Do_Not_Publish"]=True
    rows[-1]["fields"][story.RECEIPT]=json.dumps({"fingerprint":digest,"url":url,"state":"verified","sha256":"a"*64})
    with pytest.raises(steps.StepBlocked): steps._verified_story_recovery_scope(ctx)
    rows[-1]["fields"][story.RECEIPT]=json.dumps({"fingerprint":digest,"url":url,"state":"verified","sha256":"a"*64,
        "history_original_sha256":evidence["sha256"],"history_created_at":evidence["created_at"]})
    assert steps._verified_story_recovery_scope(ctx)==frozenset(evidence["outputs"])


def test_audited_short_history_pitch_correction_is_checksum_bound(monkeypatch):
    import hashlib
    from types import SimpleNamespace
    from pathlib import Path
    from studio_produce import story_history_recovery as history
    from audio import voiceover_duration, speech_activity

    original=b"original speech bytes "*100
    paced=b"pitch preserved speech "*100
    digest=hashlib.sha256(original).hexdigest()
    monkeypatch.setattr(history,"_SHORT_AUDITED_ORIGINALS",{digest})
    monkeypatch.setattr(voiceover_duration,"probe_audio_duration_bytes",lambda data:1.439637 if data==original else 2.24)
    monkeypatch.setattr(speech_activity,"probe_max_volume_db",lambda data:-21.6)
    def transcode(cmd,**kw):
        assert "-xerror" in cmd and "apad" not in " ".join(cmd)
        assert 0.60 <= float(cmd[cmd.index("-af")+1].split("=")[1]) < 1.0
        assert Path(cmd[cmd.index("-i")+1]).read_bytes()==original
        Path(cmd[-1]).write_bytes(paced)
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(history.subprocess,"run",transcode)
    assert history.fit_short_audited_history(original,{"sha256":digest})==paced
    with pytest.raises(RuntimeError,match="checksum mismatch"):
        history.fit_short_audited_history(original+b"changed",{"sha256":digest})
    assert history.fit_short_audited_history(original,{"sha256":"unrelated"})==original
    monkeypatch.setattr(speech_activity,"probe_max_volume_db",lambda data:-45)
    with pytest.raises(RuntimeError,match="not safely pace-correctable"):
        history.fit_short_audited_history(original,{"sha256":digest})


@pytest.mark.parametrize("mode, expected", [
    ("absent", "Ready for Render"),
    ("present", "Blocked"),
    ("wrong_fingerprint", "Blocked"),
    ("scheduled", "Blocked"),
    ("publish_state", "Blocked"),
    ("wrong_parent", "Blocked"),
    ("failed_sibling", "Blocked"),
])
def test_3159_held_storage_rearm_is_exact_and_no_paid_call(monkeypatch, mode, expected):
    from copy import deepcopy
    from contextlib import nullcontext
    from studio_produce import workload_governor, context
    from p2 import elevenlabs_client
    from integrations.r2_upload import R2UploadClient
    from item4 import settings as item_settings
    p = parent()
    row = output(Content_Item=[p["id"]], Output_Status="In Production",
        Render_Status="Blocked", Remotion_Error_Message=story.STORY_STORAGE_GUARD,
        Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]',
        Review_Status="Pending Review", Do_Not_Publish=True,
        Auto_Publish_Enabled=False, Publish_Status="Not Ready")
    digest = story.fingerprint(p["id"], "voice-1",
        story.story_text(p["fields"]["Voiceover_Script"]), story.story_seconds(row))
    monkeypatch.setattr(story, "HELD_STORAGE_RECOVERY", {
        row["id"]: ("wrong" if mode == "wrong_parent" else p["id"],
                    "0"*64 if mode == "wrong_fingerprint" else digest)})
    if mode == "scheduled":
        row["fields"]["Scheduled_Post_Date"] = "2026-12-13"
    if mode == "publish_state":
        row["fields"]["Publish_Status"] = "Ready to Publish"
    rows = {p["id"]: deepcopy(p), row["id"]: deepcopy(row)}
    client = Mock()
    client.get_record.side_effect = lambda table, rid: deepcopy(rows[rid])
    def update(table, rid, patch, **kwargs):
        rows[rid]["fields"].update(patch)
    client.update_record.side_effect = update
    monkeypatch.setattr(workload_governor, "enabled", lambda: True)
    monkeypatch.setattr(workload_governor, "resource_slot", lambda *a, **k: nullcontext())
    monkeypatch.setattr(elevenlabs_client, "resolve_content_voice_id", lambda _: "voice-1")
    paid = Mock(side_effect=AssertionError("rearm must not synthesize"))
    monkeypatch.setattr(elevenlabs_client, "synthesize_voiceover_by_id", paid)
    monkeypatch.setattr(item_settings, "pipeline_settings", lambda *_: {})
    sibling = deepcopy(row)
    sibling["id"] = "recBBBBBBBBBBBBBB"
    sibling["fields"][story.RECEIPT] = json.dumps({
        "fingerprint":digest, "state":"failed",
        "url":f"https://media.chicagoshining.com/studio/previews/story-voiceover/{p['id']}/{digest}.mp3"})
    monkeypatch.setattr(context, "load_outputs",
        lambda *_: [row,sibling] if mode == "failed_sibling" else [row])
    monkeypatch.setattr(R2UploadClient, "story_audio_exists", lambda *_: mode == "present")
    result = story.rearm_story_sentence_guard(client,row,p)
    assert result["fields"]["Render_Status"] == expected
    assert result["fields"]["Do_Not_Publish"] is True
    assert result["fields"]["Auto_Publish_Enabled"] is False
    paid.assert_not_called()
    if expected == "Blocked":
        client.update_record.assert_not_called()
    else:
        assert client.update_record.call_count == 1
        assert client.update_record.call_args.args[2] == {"Render_Status":"Ready for Render"}


def test_3159_exact_concise_story_does_not_change_parent_or_other_outputs():
    from copy import deepcopy
    p = {"id":"rec98yS7Pl7tAAqih","fields":{"Voiceover_Script":story._CONCISE_3159_SOURCE}}
    original = deepcopy(p)
    row = output(Content_Item=[p["id"]], Output_Status="In Production",
        Render_Status="Blocked", Remotion_Error_Message=story.STORY_MISSING_SENTENCE,
        Composition_ID="Story", Render_Clip_List_JSON='[{"durationFrames":300}]',
        Do_Not_Publish=True, Auto_Publish_Enabled=False, Publish_Status="Not Ready")
    row["id"] = "recZVRMvmIYwTwKTd"
    assert story.story_text_for_output(row,p) == "Make the most of a CTA day pass and roam Chicago."
    assert story.fingerprint(p["id"],"xVQH621DS3eyBYrseRt5",
        story.story_text_for_output(row,p),story.story_seconds(row)) == story.HELD_STORAGE_RECOVERY[row["id"]][1]
    assert story.story_sentence_recovery_candidate(row,p)
    assert p == original
    unrelated = {**row,"id":"recOther"}
    assert not story.story_sentence_recovery_candidate(unrelated,p)
    changed = deepcopy(p)
    changed["fields"]["Voiceover_Script"] += " Changed."
    assert not story.story_sentence_recovery_candidate(row,changed)
    row["fields"]["Scheduled_Post_Date"] = "2026-12-01"
    assert not story.story_sentence_recovery_candidate(row,p)
