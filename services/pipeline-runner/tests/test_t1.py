from t1.apply import analysis_window, apply_timeline, music_is_enabled, resolve_rules, voiceover_end_seconds
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


def test_apply_timeline_trims_video_to_plan_slot():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 90, "media_kind": "photo"},
        {"url": "https://cdn/b.mp4", "durationFrames": 180, "mediaKind": "video", "sourceDurationSeconds": 6},
    ]
    timed = apply_timeline(clips, {
        "timeline": {
            "fps": 30,
            "duration_frames": 240,
            "clips": [
                {"duration_frames": 60, "start_frame": 0},
                {"duration_frames": 45, "start_frame": 60},
            ]
        }
    })
    assert timed[0]["durationFrames"] == 60
    assert timed[1]["durationFrames"] == 45
    assert timed[1]["startFromSeconds"] == 0
    assert timed[1]["startFrame"] == 60


def test_apply_timeline_scales_photos_around_trimmed_video():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 100, "media_kind": "photo"},
        {"url": "https://cdn/b.mov", "durationFrames": 120, "media_kind": "video", "sourceDurationSeconds": 8},
        {"url": "https://cdn/c.jpg", "durationFrames": 100, "media_kind": "photo"},
    ]
    timed = apply_timeline(clips, {
        "timeline": {
            "fps": 30,
            "duration_frames": 300,
            "clips": [
                {"duration_frames": 60, "start_frame": 0},
                {"duration_frames": 60, "start_frame": 60},
                {"duration_frames": 180, "start_frame": 120},
            ],
        }
    })
    assert [clip["durationFrames"] for clip in timed] == [60, 60, 180]
    assert [clip["startFrame"] for clip in timed] == [0, 60, 120]
    assert timed[1]["startFromSeconds"] == 0


def test_apply_timeline_keeps_mixed_media_plan_boundaries():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 60, "media_kind": "photo"},
        {"url": "https://cdn/b.jpg", "durationFrames": 60, "media_kind": "photo", "transition": {"type": "fade", "durationFrames": 12}},
        {"url": "https://cdn/c.mov", "durationFrames": 70, "media_kind": "video", "transition": {"type": "fade", "durationFrames": 12}, "sourceDurationSeconds": 8},
        {"url": "https://cdn/d.jpg", "durationFrames": 60, "media_kind": "photo", "transition": {"type": "fade", "durationFrames": 12}},
        {"url": "https://cdn/e.jpg", "durationFrames": 60, "media_kind": "photo", "transition": {"type": "fade", "durationFrames": 12}},
    ]
    timed = apply_timeline(clips, {
        "beats_in_window": [2.0, 4.0, 6.0, 8.0],
        "timeline": {
            "fps": 30,
            "duration_frames": 300,
            "clips": [
                {"duration_frames": 60, "start_frame": 0},
                {"duration_frames": 60, "start_frame": 60, "transition": {"type": "fade", "duration_frames": 12}},
                {"duration_frames": 60, "start_frame": 120, "transition": {"type": "fade", "duration_frames": 12}},
                {"duration_frames": 60, "start_frame": 180, "transition": {"type": "fade", "duration_frames": 2}},
                {"duration_frames": 60, "start_frame": 240, "transition": {"type": "fade", "duration_frames": 2}},
            ],
        },
    })
    assert [clip["startFrame"] for clip in timed] == [0, 60, 120, 180, 240]
    assert timed[2]["durationFrames"] == 60
    assert timed[3]["transition"]["durationFrames"] == 2
    assert sum(clip["durationFrames"] for clip in timed) == 300


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
    assert resolve_rules(output)["rules"][0]["until"] == "voiceover_end"
    assert resolve_rules(output)["strategy"] == "vo_phased"
    output["fields"]["Timing_Rules_JSON"] = '{"rules":[{"remaining":true,"every_n_beats":2}]}'
    assert resolve_rules(output)["strategy"] == "vo_phased"
    output["fields"]["Timing_Rules_JSON"] = '{"recycle": true}'
    merged = resolve_rules(output)
    assert merged["recycle"] is True
    assert merged["rules"][0]["until"] == "voiceover_end"
    output["fields"]["Studio_Effective_Background_Music_Mode"] = "No"
    assert music_is_enabled(output) is False
    video_rules = resolve_rules({"fields": {}}, has_video=True)
    assert video_rules["recycle"] is True
    assert video_rules["max_clips"] == 60


def test_analysis_window_clamps_voiceover_to_owner_duration():
    output = {
        "fields": {
            "Studio_Effective_Video_Duration_Seconds": 12,
            "Studio_Effective_Voiceover_Duration_Seconds": 20,
            "Voiceover_Tail_Seconds": 2,
        }
    }
    assert voiceover_end_seconds(output) == 20.0
    assert analysis_window(output) == (0.0, 12.0)


def test_analysis_window_extends_for_voiceover_without_owner_cap():
    output = {
        "fields": {
            "Studio_Effective_Voiceover_Duration_Seconds": 20,
            "Voiceover_Tail_Seconds": 2,
        }
    }
    assert analysis_window(output) == (0.0, 22.0)


def test_apply_timeline_cycles_source_clips():
    clips = [
        {"url": "https://cdn/a.jpg", "durationFrames": 30},
        {"url": "https://cdn/b.jpg", "durationFrames": 30},
    ]
    timed = apply_timeline(clips, {
        "timeline": {
            "clips": [
                {"duration_frames": 20, "start_frame": 0},
                {"duration_frames": 20, "start_frame": 20},
                {"duration_frames": 20, "start_frame": 40},
                {"duration_frames": 20, "start_frame": 60},
            ]
        }
    })
    assert [clip["url"] for clip in timed] == [
        "https://cdn/a.jpg",
        "https://cdn/b.jpg",
        "https://cdn/a.jpg",
        "https://cdn/b.jpg",
    ]
    assert timed[-1]["durationFrames"] == 20
    assert timed[-1]["startFrame"] == 60


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


def test_expand_to_timeline_slices_one_long_video_across_beats():
    from t1.slice import expand_to_timeline

    clips = [{
        "id": "studio-source-1",
        "url": "https://cdn/long.mp4",
        "media_kind": "video",
        "sourceDurationSeconds": 60,
        "durationFrames": 1800,
        "googleDriveFileId": "vid1",
    }]
    plan_clips = [{"duration_frames": 30, "start_frame": index * 30} for index in range(30)]
    timed = expand_to_timeline(clips, {
        "timeline": {"fps": 30, "duration_frames": 900, "clips": plan_clips},
    })
    assert len(timed) == 30
    assert sum(clip["durationFrames"] for clip in timed) == 900
    starts = [clip["startFromSeconds"] for clip in timed]
    assert starts[0] == 0
    assert starts[1] == 1
    assert starts[-1] == 29
    assert len(set(starts)) == 30


def test_expand_to_timeline_round_robins_videos_and_keeps_photos_once():
    from t1.slice import expand_to_timeline

    clips = [
        {"id": "p1", "url": "https://cdn/a.jpg", "media_kind": "photo", "durationFrames": 90},
        {"id": "v1", "url": "https://cdn/one.mp4", "media_kind": "video", "sourceDurationSeconds": 60, "googleDriveFileId": "v1"},
        {"id": "v2", "url": "https://cdn/two.mp4", "media_kind": "video", "sourceDurationSeconds": 60, "googleDriveFileId": "v2"},
    ]
    plan_clips = [{"duration_frames": 30, "start_frame": index * 30} for index in range(10)]
    timed = expand_to_timeline(clips, {
        "timeline": {"fps": 30, "duration_frames": 300, "clips": plan_clips},
    })
    assert len(timed) == 10
    photo_slots = [clip for clip in timed if clip["media_kind"] == "photo"]
    video_slots = [clip for clip in timed if clip["media_kind"] == "video"]
    assert len(photo_slots) == 1
    assert len(video_slots) == 9
    assert {clip["url"] for clip in video_slots} == {"https://cdn/one.mp4", "https://cdn/two.mp4"}


def test_expand_without_beats_slices_one_long_video_with_stills():
    from t1.slice import expand_without_beats

    clips = [
        {"id": "p1", "url": "https://cdn/a.jpg", "media_kind": "photo", "durationFrames": 90},
        {"id": "p2", "url": "https://cdn/b.jpg", "media_kind": "photo", "durationFrames": 90},
        {
            "id": "v1",
            "url": "https://cdn/long.mp4",
            "media_kind": "video",
            "sourceDurationSeconds": 60,
            "durationFrames": 720,
            "startFromSeconds": 0,
        },
    ]
    timed = expand_without_beats(clips, target_frames=900, fps=30)
    assert sum(clip["durationFrames"] for clip in timed) == 900
    assert sum(1 for clip in timed if clip["media_kind"] == "photo") == 2
    assert sum(1 for clip in timed if clip["media_kind"] == "video") >= 2
    video_starts = [clip["startFromSeconds"] for clip in timed if clip["media_kind"] == "video"]
    assert len(set(video_starts)) == len(video_starts)


def test_pick_in_point_prefers_scene_timestamps():
    from t1.slice import pick_in_point

    clip = {"url": "https://cdn/long.mp4", "media_kind": "video", "sourceDurationSeconds": 60, "googleDriveFileId": "vid1"}
    used = {}
    first = pick_in_point(clip, 2.0, used, {"vid1": [8.0, 20.0, 40.0]})
    second = pick_in_point(clip, 2.0, used, {"vid1": [8.0, 20.0, 40.0]})
    assert first == 8.0
    assert second == 20.0


def test_scene_times_use_cache_and_probe():
    from t1.scenes import scene_times_for_clips

    clips = [
        {
            "url": "https://cdn/long.mp4",
            "media_kind": "video",
            "googleDriveFileId": "vid1",
            "scene_seconds": [3.5, 9.0],
        }
    ]
    times = scene_times_for_clips(clips, drive=None)
    assert times["vid1"] == [3.5, 9.0]

    probed = []

    class Drive:
        def download_file(self, file_id):
            probed.append(file_id)
            return b"bytes", "video/mp4"

    fresh = [{"url": "https://cdn/two.mp4", "media_kind": "video", "googleDriveFileId": "vid2", "assetName": "two.mp4"}]
    times = scene_times_for_clips(fresh, drive=Drive(), probe=lambda path: [1.0, 4.0])
    assert probed == ["vid2"]
    assert times["vid2"] == [1.0, 4.0]

