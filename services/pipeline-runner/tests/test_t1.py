from t1.apply import analysis_window, apply_timeline, music_is_enabled, resolve_rules
from t1.formulas import t1_production_formula
from r4.render_request import attach_timing_plan, timing_blocks_render
from stages.registry import STAGE_NAMES, is_implemented


def test_t1_is_registered():
    assert "t1" in STAGE_NAMES
    assert is_implemented("t1")


def test_t1_formula_waits_for_ready_render_and_music():
    formula = t1_production_formula()
    assert '{Render_Status}="Ready for Render"' in formula
    assert "{Timing_Status}=BLANK()" in formula
    assert '{Music_URL}!=""' in formula


def test_apply_timeline_preserves_urls_and_phase6_transition_type():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 150, "overlay": {"text": "A"}},
        {"url": "https://cdn/b.jpg", "durationFrames": 150, "transition": {"type": "slideLeft", "durationFrames": 8}},
    ]
    timed = apply_timeline(clips, {
        "timeline": {
            "clips": [
                {"duration_frames": 90, "start_frame": 0},
                {"duration_frames": 120, "start_frame": 90, "transition": {"type": "fade", "duration_frames": 12}},
            ]
        }
    })
    assert [clip["url"] for clip in timed] == ["https://cdn/a.jpg", "https://cdn/b.jpg"]
    assert timed[0]["durationFrames"] == 90
    assert timed[1]["durationFrames"] == 120
    assert timed[1]["transition"]["type"] == "slideLeft"
    assert timed[0]["overlay"]["text"] == "A"


def test_apply_timeline_keeps_video_duration():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 90, "media_kind": "photo"},
        {"url": "https://cdn/b.mp4", "durationFrames": 180, "mediaKind": "video"},
    ]
    timed = apply_timeline(clips, {
        "timeline": {
            "clips": [
                {"duration_frames": 60, "start_frame": 0},
                {"duration_frames": 45, "start_frame": 60},
            ]
        }
    })
    assert timed[0]["durationFrames"] == 60
    assert timed[1]["durationFrames"] == 180
    assert timed[1]["startFrame"] == 60


def test_music_and_window_helpers():
    output = {
        "fields": {
            "Music_URL": "https://drive.google.com/uc?export=download&id=abc1234567",
            "Studio_Effective_Background_Music_Mode": "Yes",
            "Music_Start_Seconds": 4,
            "Studio_Effective_Video_Duration_Seconds": 20,
        }
    }
    assert music_is_enabled(output) is True
    assert analysis_window(output) == (4.0, 20.0)
    assert resolve_rules(output)["rules"][0]["every_n_beats"] == 2
    output["fields"]["Studio_Effective_Background_Music_Mode"] = "No"
    assert music_is_enabled(output) is False


def test_r4_waits_for_timing_when_music_pending():
    output = {
        "fields": {
            "Music_URL": "https://example.com/track.mp3",
            "Timing_Status": "Pending",
        }
    }
    assert timing_blocks_render(output) is True
    output["fields"]["Timing_Status"] = "Ready"
    assert timing_blocks_render(output) is False
    output["fields"]["Timing_Status"] = "Failed"
    assert timing_blocks_render(output) is True


def test_r4_attaches_timing_plan():
    output = {
        "fields": {
            "Timing_Timeline_JSON": '{"schema_version":"timing.timeline.1","clips":[]}',
        }
    }
    payload = attach_timing_plan({}, output)
    assert payload["timingPlan"]["schema_version"] == "timing.timeline.1"
    assert payload["durationIsExplicit"] is True
