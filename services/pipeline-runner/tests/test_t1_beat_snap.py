from t1.apply import snap_timeline_to_beats


def test_snap_timeline_uses_detected_beats_and_respects_requested_duration():
    beats = [
        1.9969, 2.4845, 2.9489, 3.4366, 3.9010, 4.3654, 4.8530, 5.3174,
        5.7818, 6.2694, 6.7338, 7.2214, 7.6858, 8.1502, 8.6146, 9.0790,
        9.5666, 10.0542, 10.5186, 11.0063, 11.4707, 11.9583, 12.4227,
        12.9103, 13.3515, 13.8391, 14.3035, 14.7447, 15.2091, 15.6967,
        16.1379, 16.5790, 17.0202, 17.4614, 17.9026, 18.3438, 18.8082,
        19.2493, 19.6673, 20.1549, 20.6193, 21.1069, 21.5946, 22.0590,
        22.5234, 23.0110, 23.4522, 23.9166, 24.4042, 24.8918, 25.3562,
        25.8670, 26.3082, 26.7726, 27.2370, 27.7246, 28.1890, 28.6534,
        29.1178, 29.5590,
    ]
    strengths = [0.5] * len(beats)
    for index in (4, 10, 16, 22, 28, 34, 40, 46, 54):
        strengths[index] = 1.0
    response = {
        "beats": beats,
        "beats_in_window": beats,
        "beat_strengths": strengths,
        "window": {"start_seconds": 0, "duration_seconds": 30},
        "timeline": {
            "fps": 30,
            "duration_seconds": 43.6667,
            "duration_frames": 1310,
            "clips": [
                {
                    "index": index,
                    "start_seconds": index * 4.3667,
                    "duration_seconds": 4.3667,
                    "duration_frames": 131,
                    "start_frame": index * 131,
                    **({"transition": {"type": "fade", "duration_frames": 12}} if index else {}),
                }
                for index in range(10)
            ],
            "metadata": {"strategy": "equal_beats", "timeline_end_seconds": 29.559},
        },
    }

    fixed = snap_timeline_to_beats(response, clip_count=10, fps=30, requested_duration=30.0)
    timeline = fixed["timeline"]
    assert timeline["duration_frames"] == 900
    assert len(timeline["clips"]) == 10
    transitions = timeline["transitions"]
    assert len(transitions) == 9
    for transition in transitions:
        assert any(abs(transition["at_seconds"] - beat) <= (1 / 30 + 0.001) for beat in beats)
        assert transition["duration_frames"] <= 6
    assert timeline["metadata"]["beat_snap_v2"]["enabled"] is True
