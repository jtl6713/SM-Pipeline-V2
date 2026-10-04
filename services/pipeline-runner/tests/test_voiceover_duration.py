from audio.voiceover_duration import (
    MIN_VOICEOVER_SECONDS,
    apply_min_voiceover_floor,
    owner_video_seconds,
    render_video_seconds,
    required_voiceover_seconds,
    validate_voiceover_for_owner_cap,
    validate_voiceover_for_render,
    voiceover_exceeds_video,
    voiceover_exceeds_video_message,
)


def test_voiceover_exceeds_video_when_spoken_runs_past_end():
    assert voiceover_exceeds_video(voiceover_seconds=26.8, video_seconds=25.0, tail_seconds=2.0) is True
    assert voiceover_exceeds_video(voiceover_seconds=24.0, video_seconds=25.0, tail_seconds=2.0) is True
    assert voiceover_exceeds_video(voiceover_seconds=23.0, video_seconds=25.0, tail_seconds=2.0) is False


def test_owner_cap_validation_uses_request_video_duration():
    item = {"fields": {"Content_Duration": 30, "Voiceover_Tail_Seconds": 2}}
    request = {"fields": {"Video_Duration_Seconds": 30}}
    assert validate_voiceover_for_owner_cap(
        voiceover_seconds=26.8,
        content_item=item,
        request=request,
    ) is None
    assert validate_voiceover_for_owner_cap(
        voiceover_seconds=29.0,
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


def test_required_voiceover_seconds_floors_short_speech_to_four():
    assert MIN_VOICEOVER_SECONDS == 4.0
    assert required_voiceover_seconds(1.625) == 4.0
    assert required_voiceover_seconds(0.5) == 4.0
    assert required_voiceover_seconds(15.0) == 15.0
    assert required_voiceover_seconds(0) == 0.0
    assert required_voiceover_seconds(None) == 0.0


def test_apply_min_voiceover_floor_puts_remainder_on_last_scene():
    # Content 312: five-word TTS ~1.625s must persist as a 4s track.
    assert apply_min_voiceover_floor([1.625], 4.0) == [4.0]
    assert apply_min_voiceover_floor([1.0, 0.6], 4.0) == [1.0, 3.0]
    assert apply_min_voiceover_floor([10.0, 5.0], 15.0) == [10.0, 5.0]
    assert apply_min_voiceover_floor([]) == []
