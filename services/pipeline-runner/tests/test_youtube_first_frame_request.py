"""YouTube first encoded cover request contract: all render routes, isolated rollout."""
import pytest

from r4.render_request import attach_youtube_first_frame, choose_render_request


def output(platform="YouTube", **updates):
    fields = {
        "Platform": platform,
        "Output_ID": 888,
        "Output_Filename": "new-video.mp4",
        "Composition_ID": "ChicagoShiningPhotoSequence",
        "Thumbnail_URL": "https://media.chicagoshining.com/covers/888.png",
        "Clip_1_URL": "https://media.chicagoshining.com/clips/first.jpg",
        "Render_Total_Frames": 210,
        "Render_Clip_List_JSON": '[{"src":"https://example.com/still.jpg","durationFrames":210}]',
        "Aspect_Ratio": "9:16",
    }
    fields.update(updates)
    return {"id": "recFIRSTFRAME01", "fields": fields}


@pytest.mark.parametrize("platform", ["TikTok", "Instagram", "Facebook", ""])
def test_other_platforms_never_get_cover_overlay(monkeypatch, platform):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "all")
    route, payload = choose_render_request(output(platform), None, default_music=0.2, default_voice=1)
    assert route == "no_voiceover"
    assert "youtubeFirstFrame" not in payload


def test_disabled_by_default(monkeypatch):
    monkeypatch.delenv("YOUTUBE_FIRST_FRAME_MODE", raising=False)
    _, payload = choose_render_request(output(), None, default_music=0.2, default_voice=1)
    assert "youtubeFirstFrame" not in payload


def test_pinned_canary_only(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "canary")
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_CANARY_OUTPUT_IDS", "999")
    _, payload = choose_render_request(output(), None, default_music=0.2, default_voice=1)
    assert "youtubeFirstFrame" not in payload
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_CANARY_OUTPUT_IDS", "888")
    _, payload = choose_render_request(output(), None, default_music=0.2, default_voice=1)
    assert payload["youtubeFirstFrame"]["enabled"] is True


@pytest.mark.parametrize("manifest, voiceover, route_expected", [
    ("", "", "no_voiceover"),
    ("{}", "", "p020_manifest"),
    ("", "https://example.com/vo.mp3", "voiceover"),
])
def test_every_render_request_route_receives_shared_cover(monkeypatch, manifest, voiceover, route_expected):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "all")
    record = output(Creative_Render_Manifest_JSON=manifest, Voiceover_URL=voiceover)
    route, payload = choose_render_request(record, None, default_music=0.2, default_voice=1)
    assert route == route_expected
    first = payload["youtubeFirstFrame"]
    assert first == {
        "enabled": True,
        "coverUrl": "https://media.chicagoshining.com/covers/888.png",
        "holdFrames": 21,
        "fadeFrames": 4,
    }
    assert payload["durationInFrames"] == 210
    assert len(payload["clips"]) == 1


def test_missing_thumbnail_never_silently_substitutes_first_clip(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "all")
    payload = attach_youtube_first_frame({}, output(Thumbnail_URL=""))
    assert payload["youtubeFirstFrame"]["coverUrl"] == ""
    assert "first.jpg" not in repr(payload)


def test_source_order_and_timing_unchanged(monkeypatch):
    monkeypatch.setenv("YOUTUBE_FIRST_FRAME_MODE", "all")
    record = output(Render_Clip_List_JSON='[{"id":"a","durationFrames":90},{"id":"b","durationFrames":120}]')
    _, payload = choose_render_request(record, None, default_music=0.2, default_voice=1)
    assert [x["id"] for x in payload["clips"]] == ["a", "b"]
    assert [x["durationFrames"] for x in payload["clips"]] == [90, 120]
    assert payload["durationInFrames"] == 210
