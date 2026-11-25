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
    monkeypatch.setattr(story.requests, "get", lambda *a, **k: SimpleNamespace(status_code=404))
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
