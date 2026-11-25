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
