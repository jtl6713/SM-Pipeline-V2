from timing_engine.rules import apply_rules, spread_then_snap
from timing_engine.sources import TimingContext, VoiceoverSource
from timing_engine.timeline import build_timeline


def test_every_third_then_every_beat():
    beats = [i * 0.5 for i in range(20)]
    cuts, meta = apply_rules(
        beats,
        clip_count=8,
        duration_seconds=10,
        rules={"rules": [{"transition_count": 3, "every_n_beats": 3}, {"remaining": True, "every_n_beats": 1}]},
        min_clip_seconds=0.4,
    )
    assert len(cuts) == 7
    assert cuts[0] == 1.0
    assert cuts[1] == 2.5
    assert cuts[2] == 4.0
    assert cuts[3] == 4.5
    assert not meta["fallback"]
    assert meta["strategy"] == "legacy"


def test_sparse_beats_fall_back_to_even_split():
    cuts, meta = apply_rules(
        [0.4],
        clip_count=5,
        duration_seconds=10,
        rules={"rules": [{"remaining": True, "every_n_beats": 1}]},
        min_clip_seconds=0.4,
    )
    assert len(cuts) == 4
    assert meta["fallback"] == "even_split_remainder"


def test_timeline_frames_sum_to_duration():
    beats = [i * 0.5 for i in range(16)]
    plan = build_timeline(
        beats_in_window=beats,
        clip_count=4,
        duration_seconds=8,
        fps=30,
        rules={"rules": [{"remaining": True, "every_n_beats": 2}]},
        transition={"type": "fade", "duration_frames": 12},
    )
    assert plan["duration_frames"] == 240
    assert sum(clip["duration_frames"] for clip in plan["clips"]) == 240
    assert len(plan["transitions"]) == 3
    assert all(clip["duration_frames"] > 12 for clip in plan["clips"])


def test_spread_then_snap_uses_full_duration():
    beats = [i * 0.5 for i in range(20)]
    cuts = spread_then_snap(beats, 4, 0.0, 10.0, min_clip_seconds=0.4)
    assert len(cuts) == 4
    assert cuts[0] >= 1.0
    assert cuts[-1] <= 9.0
    assert cuts[-1] - cuts[0] > 4.0


def test_phased_without_voiceover_spreads_across_duration():
    beats = [i * 0.5 for i in range(24)]
    cuts, meta = apply_rules(
        beats,
        clip_count=5,
        duration_seconds=12,
        rules={"strategy": "vo_phased", "rules": [{"until": "voiceover_end", "every_n_beats": 8, "spread": True}]},
        min_clip_seconds=0.4,
    )
    assert len(cuts) == 4
    assert meta["strategy"] == "spread"
    assert cuts[-1] > 6.0


def test_phased_slow_during_voiceover_then_tail():
    beats = [i * 0.5 for i in range(40)]
    strengths = [0.4 if time < 8 else 1.0 for time in beats]
    cuts, meta = apply_rules(
        beats,
        clip_count=5,
        duration_seconds=20,
        rules={
            "strategy": "vo_phased",
            "recycle": False,
            "vo_clip_share": 0.35,
            "rules": [
                {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
                {"remaining": True, "every_n_beats": 1},
            ],
        },
        min_clip_seconds=0.4,
        voiceover_end_seconds=8,
        beat_strengths=strengths,
    )
    assert len(cuts) == 4
    assert meta["strategy"] == "vo_phased"
    vo_cuts = [cut for cut in cuts if cut < 8]
    tail_cuts = [cut for cut in cuts if cut >= 8]
    assert vo_cuts
    assert tail_cuts
    assert cuts[-1] > 10


def test_recycle_expands_tail_to_beats():
    beats = [i * 0.5 for i in range(24)]
    cuts, meta = apply_rules(
        beats,
        clip_count=5,
        duration_seconds=12,
        rules={
            "strategy": "vo_phased",
            "recycle": True,
            "rules": [
                {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
                {"remaining": True, "every_n_beats": 1},
            ],
        },
        min_clip_seconds=0.4,
        voiceover_end_seconds=4,
    )
    assert meta["recycle"] is True
    assert meta["effective_clip_count"] > 5
    assert len(cuts) + 1 == meta["effective_clip_count"]
    assert any(cut >= 4 for cut in cuts)


def test_recycle_timeline_adds_virtual_clips():
    beats = [i * 0.5 for i in range(24)]
    plan = build_timeline(
        beats_in_window=beats,
        clip_count=5,
        duration_seconds=12,
        fps=30,
        rules={
            "strategy": "vo_phased",
            "recycle": True,
            "rules": [
                {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
                {"remaining": True, "every_n_beats": 1},
            ],
        },
        voiceover_end_seconds=4,
    )
    assert len(plan["clips"]) > 5
    assert sum(clip["duration_frames"] for clip in plan["clips"]) == plan["duration_frames"]


def test_voiceover_source_emits_end_event():
    ctx = TimingContext(
        audio_path="unused.wav",
        music_start_seconds=0,
        music_duration_seconds=20,
        extra={"voiceover_end_seconds": 7.5},
    )
    events = VoiceoverSource().analyze(ctx)
    assert len(events) == 1
    assert events[0].kind == "voiceover_end"
    assert events[0].time_seconds == 7.5
