from audio.voiceover_duration import (
    MIN_VOICEOVER_SECONDS,
    VoiceoverTooShort,
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
