from studio_produce.stamp import (
    _ai_directed_motion,
    _render_fit,
    _render_motion,
    _render_override_for_item,
    _render_transition,
    render_overrides_from_request,
    render_settings_from_request,
)
from t1.processor import _beat_sync_disabled


def _request(notes=""):
    return {"fields": {"Production_Notes": notes}}


def test_render_directives_auto_preserve_legacy_motion_fit_and_transition():
    settings = render_settings_from_request(_request("origin=ez-wizard; ez-input=multiple-photos"))
    assert settings["preset"] == "auto"
    assert _render_motion(settings, 0, story=False, video=False) == "none"
    assert _render_motion(settings, 0, story=True, video=False) == "slowZoom"
    assert _render_fit(settings, story=False, video=False) == "full_with_solid_background"
    assert _render_fit(settings, story=True, video=False) == "fill_crop"
    assert _render_transition(settings, 0) is None


def test_render_directives_parse_preset_and_explicit_overrides():
    notes = (
        "origin=ez-wizard; ez-input=multiple-photos\n"
        "[render-settings] preset=cinematic; motion=pan_left; transition=zoom; "
        "transition_seconds=0.5; duration_mode=fixed; duration_seconds=4; "
        "intensity=dramatic; pacing=fast; fit=cover; beat_sync=off"
    )
    settings = render_settings_from_request(_request(notes))
    assert settings["preset"] == "cinematic"
    assert settings["motion"] == "pan_left"
    assert settings["transition"] == "zoom"
    assert settings["duration_mode"] == "fixed"
    assert settings["duration_seconds"] == "4"
    assert settings["intensity"] == "dramatic"
    assert settings["pacing"] == "fast"
    assert settings["fit"] == "cover"
    assert settings["beat_sync"] == "off"
    assert _render_motion(settings, 0, story=False, video=False) == "panLeft"
    assert _render_fit(settings, story=False, video=False) == "fill_crop"
    assert _render_transition(settings, 0) == {"type": "zoom", "durationFrames": 15}


def test_ken_burns_and_directional_transitions_are_deterministic():
    settings = render_settings_from_request(_request(
        "[render-settings] preset=auto; motion=ken_burns; transition=push; "
        "intensity=normal; pacing=normal; fit=smart_crop; beat_sync=on"
    ))
    assert _render_motion(settings, 0, story=False, video=False) == "kenBurnsLeft"
    assert _render_motion(settings, 1, story=False, video=False) == "kenBurnsRight"
    assert _render_transition(settings, 0)["type"] == "pushLeft"
    assert _render_transition(settings, 1)["type"] == "pushRight"


def test_beat_sync_off_is_carried_by_render_clip_contract():
    disabled = {
        "fields": {
            "Render_Clip_List_JSON": '[{"url":"https://cdn/a.jpg","beatSync":false},{"url":"https://cdn/b.jpg","beatSync":false}]'
        }
    }
    enabled = {
        "fields": {
            "Render_Clip_List_JSON": '[{"url":"https://cdn/a.jpg","beatSync":true}]'
        }
    }
    assert _beat_sync_disabled(disabled) is True
    assert _beat_sync_disabled(enabled) is False



def test_per_photo_render_overrides_parse_and_match_source_asset():
    import json
    from urllib.parse import quote

    encoded = quote(json.dumps({
        "recSourceA": {"motion": "pan_left", "transition": "none", "fit": "contain"},
        "recSourceB": {"motion": ""},
    }), safe="")
    overrides = render_overrides_from_request(_request(f"[render-overrides] {encoded}"))
    assert overrides == {
        "recSourceA": {"motion": "pan_left", "transition": "none", "fit": "contain"},
    }
    item = {
        "source": {"id": "recSourceA"},
        "media_asset_id": "recMediaA",
    }
    assert _render_override_for_item(overrides, item)["motion"] == "pan_left"


def test_ai_motion_is_opt_in_and_skips_explicit_frame_override(monkeypatch):
    seen = {}

    def fake_classify(prompt, *, image_urls=None, max_output_tokens=0):
        seen["prompt"] = prompt
        seen["urls"] = list(image_urls or [])
        return {
            "parsed": {
                "motions": [
                    {"index": 1, "motion": "slow_zoom_in", "reason": "centered skyline"},
                ]
            }
        }

    import a3.openai_classify as openai_classify
    monkeypatch.setattr(openai_classify, "classify_asset", fake_classify)

    clips = [
        {
            "source": {"id": "recA"},
            "media_asset_id": "recMediaA",
            "media_kind": "photo",
            "url": "https://media.example/a.jpg",
        },
        {
            "source": {"id": "recB"},
            "media_asset_id": "recMediaB",
            "media_kind": "photo",
            "url": "https://media.example/b.jpg",
        },
    ]
    overrides = {"recB": {"motion": "pan_right"}}
    settings = {
        "ai_motion": "on",
        "preset": "cinematic",
        "intensity": "subtle",
        "pacing": "relaxed",
    }
    directed = _ai_directed_motion(clips, settings, overrides)
    assert directed[0]["motion"] == "slow_zoom_in"
    assert 1 not in directed
    assert seen["urls"] == ["https://media.example/a.jpg"]

    settings["ai_motion"] = "off"
    assert _ai_directed_motion(clips, settings, overrides) == {}
