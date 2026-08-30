from timing_engine.rules import apply_rules
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
