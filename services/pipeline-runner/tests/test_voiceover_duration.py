import json

from audio.voiceover_duration import (
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
    extend_render_clips_to_cover_voiceover,
    owner_video_seconds,
    render_video_seconds,
    validate_voiceover_for_owner_cap,
    validate_voiceover_for_render,
    voiceover_exceeds_video,
    voiceover_exceeds_video_message,
)


def test_voiceover_exceeds_video_when_spoken_runs_past_end():
    assert voiceover_exceeds_video(voiceover_seconds=26.8, video_seconds=25.0, tail_seconds=2.0) is True
    assert voiceover_exceeds_video(voiceover_seconds=24.0, video_seconds=25.0, tail_seconds=2.0) is False
    assert voiceover_exceeds_video(voiceover_seconds=23.0, video_seconds=25.0, tail_seconds=2.0) is False


def test_owner_cap_validation_uses_request_video_duration():
    item = {"fields": {"Content_Duration": 30, "Voiceover_Tail_Seconds": 2}}
    request = {"fields": {"Video_Duration_Seconds": 30}}
    assert validate_voiceover_for_owner_cap(
        voiceover_seconds=29.0,
        content_item=item,
        request=request,
    ) is None
    assert validate_voiceover_for_owner_cap(
        voiceover_seconds=32.0,
        content_item=item,
        request=request,
    ) is not None


def test_render_validation_blocks_output_729_shape():
    output = {
        "fields": {
            "Render_Total_Frames": 750,
            "Voiceover_Tail_Seconds": 2,
            "Voiceover_URL": "https://drive.example/vo.mp3",
            "Timing_Timeline_JSON": '{"duration_seconds":25.0,"duration_frames":750}',
        }
    }
    content_item = {"fields": {"Voiceover_Duration_Seconds": 15}}

    def fake_probe(_url: str) -> float:
        return 26.796

    from audio import voiceover_duration as module

    original = module.probe_audio_duration_url
    module.probe_audio_duration_url = fake_probe
    try:
        message = validate_voiceover_for_render(output, content_item)
    finally:
        module.probe_audio_duration_url = original

    assert message is not None
    assert "26.80s" in message
    assert "25.00s" in message


def test_render_video_seconds_prefers_timeline():
    output = {
        "fields": {
            "Render_Total_Frames": 900,
            "Timing_Timeline_JSON": '{"duration_seconds":28.8,"duration_frames":864}',
        }
    }
    assert render_video_seconds(output) == 28.8


def test_owner_video_seconds_falls_back_to_content_duration():
    item = {"fields": {"Content_Duration": 30}}
    assert owner_video_seconds(item) == 30.0


def test_voiceover_exceeds_video_message_is_actionable():
    message = voiceover_exceeds_video_message(
        voiceover_seconds=26.8,
        video_seconds=25.0,
        tail_seconds=2.0,
        context="render duration",
    )
    assert "never run past" in message.lower()


def test_extend_render_clips_covers_output_2156_shape():
    # 7×134 + 133 = 1071 frames (35.70s). VO 35.75873 needs ceil → 1073.
    clips = []
    start = 0
    for index, frames in enumerate([134] * 7 + [133], start=1):
        clips.append({
            "id": f"studio-source-{index}",
            "order": index,
            "startFrame": start,
            "durationFrames": frames,
        })
        start += frames
    output = {
        "fields": {
            "Render_Clip_List_JSON": json.dumps(clips),
            "Render_Total_Frames": 1071,
            "Timing_Timeline_JSON": json.dumps({"duration_seconds": 35.7, "duration_frames": 1071}),
            "Voiceover_URL": "https://drive.example/vo.mp3",
            "Voiceover_Duration_Seconds": 35.75873,
            "Studio_Effective_Voiceover_Mode": "Yes",
        }
    }

    from audio import voiceover_duration as module

    original = module.probe_audio_duration_url
    module.probe_audio_duration_url = lambda _url: 35.75873
    try:
        fields = extend_render_clips_to_cover_voiceover(output, probe=True)
    finally:
        module.probe_audio_duration_url = original

    assert fields is not None
    assert fields["Render_Total_Frames"] == 1073
    assert fields["Render_Status"] == "Ready for Render"
    extended = json.loads(fields["Render_Clip_List_JSON"])
    assert sum(int(clip["durationFrames"]) for clip in extended) == 1073
    assert extended[-1]["durationFrames"] == 135
    assert validate_voiceover_for_render(
        {"fields": {**output["fields"], **{k: v for k, v in fields.items() if k != "Remotion_Error_Message"}}},
        probe=False,
    ) is None


def test_speak_until_minimum_rewrites_a_one_second_read_and_refuses_to_save_short_audio():
    from p2.voiceover_floor import speak_until_minimum

    calls = []

    def synthesize(script: str) -> bytes:
        calls.append(script)
        return script.encode("utf-8")

    def normalize(raw: bytes):
        return {"ok": True}, raw

    def probe(data: bytes) -> float:
        text = data.decode("utf-8")
        return 1.625 if text == "Your quick tour between trains." else 4.2

    def lengthen(text: str, *, measured_seconds: float) -> str:
        assert measured_seconds == 1.625
        assert text.startswith("Your quick tour")
        return "Your quick tour between trains. Look up at the ceiling, then move through with the crowd."

    audio, seconds, script, _details = speak_until_minimum(
        "Your quick tour between trains.",
        synthesize=synthesize,
        normalize=normalize,
        probe=probe,
        lengthen=lengthen,
    )
    assert seconds == 4.2
    assert seconds >= MIN_VOICEOVER_SECONDS
    assert b"Look up" in audio
    assert script.startswith("Your quick tour")
    assert len(calls) == 2


def test_speak_until_minimum_does_not_return_a_short_file():
    from p2.voiceover_floor import speak_until_minimum

    def synthesize(script: str) -> bytes:
        return b"short"

    def normalize(raw: bytes):
        return {}, raw

    try:
        speak_until_minimum(
            "Too short.",
            synthesize=synthesize,
            normalize=normalize,
            probe=lambda _data: 1.2,
            lengthen=lambda text, measured_seconds: text + " Still too short to speak.",
            attempts=2,
        )
    except VoiceoverTooShort as exc:
        assert "Not saved" in str(exc)
        assert "1.200s" in str(exc)
    else:
        raise AssertionError("short voiceover was returned")


def test_bethesda_2303_echoed_ai_rewrite_falls_back_to_measured_nonfactual_narration(monkeypatch):
    """An echoed two-second line cannot dead-end P2 or bypass the 4s floor."""
    from types import SimpleNamespace

    import ai_api_router
    import config
    from p2.voiceover_floor import lengthen_voiceover_script, speak_until_minimum

    original = "Look up—Central Park’s hidden craft."
    monkeypatch.setattr(config, "load_settings", lambda: {})
    monkeypatch.setattr(
        ai_api_router,
        "post_responses",
        lambda *_args, **_kwargs: SimpleNamespace(
            ok=True, json=lambda: {"output_text": original}
        ),
    )

    revised = lengthen_voiceover_script(original, measured_seconds=2.090)
    assert revised.startswith(original)
    assert revised != original
    assert revised.endswith(
        "Take a closer look at the scene and notice the details that stand out."
    )

    synth_calls = []

    def synthesize(script):
        synth_calls.append(script)
        return script.encode("utf-8")

    audio, seconds, spoken, _details = speak_until_minimum(
        original,
        synthesize=synthesize,
        normalize=lambda raw: ({"ok": True}, raw),
        probe=lambda raw: 2.090 if raw.decode("utf-8") == original else 4.5,
        lengthen=lengthen_voiceover_script,
    )
    assert synth_calls == [original, revised]
    assert spoken == revised
    assert audio == revised.encode("utf-8")
    assert seconds >= MIN_VOICEOVER_SECONDS


def test_bethesda_2303_empty_rewrite_falls_back_but_still_requires_measured_audio(monkeypatch):
    """An empty LLM response must not block P2 or bypass the 4-second floor."""
    from types import SimpleNamespace

    import pytest
    import ai_api_router
    import config
    from p2.voiceover_floor import lengthen_voiceover_script

    monkeypatch.setattr(config, "load_settings", lambda: {})
    monkeypatch.setattr(
        ai_api_router,
        "post_responses",
        lambda *_args, **_kwargs: SimpleNamespace(
            ok=True, json=lambda: {"output_text": ""}
        ),
    )
    from p2.voiceover_floor import speak_until_minimum

    revised = lengthen_voiceover_script("Short line.", measured_seconds=2.136)
    assert revised.startswith("Short line.")
    assert len(revised.split()) > 9

    # Even with a usable fallback script, speech that remains under 4 seconds
    # must still fail closed and never reach the save path.
    with pytest.raises(VoiceoverTooShort, match="Not saved"):
        speak_until_minimum(
            "Short line.",
            synthesize=lambda script: script.encode(),
            normalize=lambda raw: ({"normalized": True}, raw),
            probe=lambda _raw: 2.136,
            lengthen=lengthen_voiceover_script,
            attempts=2,
        )
