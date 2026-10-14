from r2.music_policy import (
    rotate_profile_music_candidates,
    scope_music_candidates_to_profile,
)
from r2.studio_exact_source import pick_music_without_openai


def _music(asset_id, duration=30):
    return {
        "id": asset_id,
        "fields": {
            "Asset Name": asset_id,
            "Duration_Seconds": duration,
            "Google Drive URL": f"https://example.com/{asset_id}.mp3",
        },
    }


def _output(output_id=100, **fields):
    return {"id": f"recOUT{output_id}", "fields": {"Output_ID": output_id, **fields}}


def _content(profile_id="recPROFILE", content_id="recCONTENT"):
    return {"id": content_id, "fields": {"Content_Profile": [profile_id]}}


class _FakeClient:
    def __init__(self, profile, recent=None):
        self.profile = profile
        self.recent = recent or []

    def get_record(self, table_id, record_id):
        assert record_id == self.profile["id"]
        return self.profile

    def list_records(self, table_id, **kwargs):
        return list(self.recent)


def _profile(pool):
    return {
        "id": "recPROFILE",
        "fields": {
            "Profile_Name": "NYC - New York City",
            "Autonomous_Music_Pool": list(pool),
        },
    }


def test_scope_music_candidates_uses_profile_pool_order():
    candidates = [_music("recA"), _music("recB"), _music("recC")]
    client = _FakeClient(_profile(["recC", "recA"]))

    scoped, context = scope_music_candidates_to_profile(
        client,
        content_item=_content(),
        music_candidates=candidates,
    )

    assert [row["id"] for row in scoped] == ["recC", "recA"]
    assert context["profile_pool_configured"] is True
    assert context["profile_pool_count"] == 2
    assert context["profile_pool_eligible_count"] == 2


def test_rotation_avoids_recent_tracks_and_moves_to_unused_pool_choices():
    candidates = [_music("recA"), _music("recB"), _music("recC"), _music("recD"), _music("recE")]
    recent = [
        _output(105, Content_Item=["recOLD1"], Content_Profile=["NYC - New York City"], Selected_Music_Media_Asset_ID="recA"),
        _output(104, Content_Item=["recOLD2"], Content_Profile=["NYC - New York City"], Selected_Music_Media_Asset_ID="recB"),
        _output(103, Content_Item=["recOLD3"], Content_Profile=["NYC - New York City"], Selected_Music_Media_Asset_ID="recC"),
    ]
    client = _FakeClient(_profile([row["id"] for row in candidates]), recent=recent)
    scoped, context = scope_music_candidates_to_profile(
        client,
        content_item=_content(),
        music_candidates=candidates,
    )

    rotated, context = rotate_profile_music_candidates(
        client,
        output=_output(106),
        content_item=_content(),
        music_candidates=scoped,
        profile_context=context,
    )

    assert [row["id"] for row in rotated] == ["recD", "recE"]
    assert context["rotation_avoided_ids"] == ["recA", "recB", "recC"]
    assert context["rotation_mode"] == "profile_lru"


def test_rotation_reuses_sibling_track_for_same_content_item():
    candidates = [_music("recA"), _music("recB"), _music("recC")]
    recent = [
        _output(
            105,
            Content_Item=["recCONTENT"],
            Content_Profile=["NYC - New York City"],
            Selected_Music_Media_Asset_ID="recC",
        ),
    ]
    client = _FakeClient(_profile([row["id"] for row in candidates]), recent=recent)
    scoped, context = scope_music_candidates_to_profile(
        client,
        content_item=_content(),
        music_candidates=candidates,
    )

    rotated, context = rotate_profile_music_candidates(
        client,
        output=_output(106),
        content_item=_content(),
        music_candidates=scoped,
        profile_context=context,
    )

    assert [row["id"] for row in rotated] == ["recC"]
    assert context["rotation_sibling_music_id"] == "recC"
    assert context["rotation_mode"] == "reuse_sibling_content_track"


def test_exact_source_picker_honors_rotation_order_not_longest_track():
    first = _music("recFirst", duration=31)
    longest = _music("recLongest", duration=90)

    chosen = pick_music_without_openai(
        [first, longest],
        required_seconds=30,
    )

    assert chosen["id"] == "recFirst"
