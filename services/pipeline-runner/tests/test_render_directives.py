from studio_produce.stamp import (
    _render_fit,
    _render_motion,
    _render_transition,
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
