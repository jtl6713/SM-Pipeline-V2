from r2.processor import _duration_eligible_music, _required_music_seconds


def _row(record_id: str, duration: float | None):
    fields = {}
    if duration is not None:
        fields["Duration_Seconds"] = duration
    return {"id": record_id, "fields": fields}


def test_required_music_seconds_uses_longest_known_render_target():
    output = {
        "fields": {
            "Studio_Effective_Video_Duration_Seconds": 30,
            "Render_Total_Frames": 1350,
            "Target_Final_Length": 30,
        }
    }
    content = {"fields": {"Content_Duration": 30}}
    assert _required_music_seconds(output, content) == 45.0


def test_duration_filter_only_exposes_tracks_long_enough_when_known():
    rows = [_row("recShort00000001", 29.5), _row("recLong000000002", 61.0), _row("recUnknown000003", None)]
    filtered, fallback = _duration_eligible_music(rows, 45.0)
    assert fallback is False
    assert [row["id"] for row in filtered] == ["recLong000000002"]


def test_duration_filter_marks_explicit_fallback_when_no_known_track_qualifies():
    rows = [_row("recShort00000001", 29.5), _row("recUnknown000003", None)]
    filtered, fallback = _duration_eligible_music(rows, 45.0)
    assert fallback is True
    assert filtered == rows
