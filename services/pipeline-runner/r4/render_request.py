from __future__ import annotations

import json
from typing import Any

from render.fields import field, field_str, parse_json_field


def _cover_url(output: dict[str, Any]) -> str:
    thumb = field_str(output, "Thumbnail_URL")
    clip1 = field_str(output, "Clip_1_URL")
    return thumb or clip1


def _dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "16:9":
        return 1920, 1080
    if aspect_ratio == "1:1":
        return 1080, 1080
    if aspect_ratio == "4:5":
        return 1080, 1350
    return 1080, 1920


def _num(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def music_start_seconds(output: dict[str, Any], content_item: dict[str, Any] | None = None) -> float:
    for record in (output, content_item or {}):
        raw = field(record, "Music_Start_Seconds")
        if raw in (None, ""):
            raw = field(record, "Studio_Effective_Music_Start_Seconds")
        try:
            if raw not in (None, "") and float(raw) >= 0:
                return float(raw)
        except (TypeError, ValueError):
            continue
    return 0.0


def _with_music_start(
    music: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(music or {})
    payload["startFromSeconds"] = music_start_seconds(output, content_item)
    return payload


def _music_volume(output: dict[str, Any], default_music: float) -> float:
    music_url = field_str(output, "Music_URL")
    if not music_url:
        return 0.0
    explicit = field(output, "Music_Volume")
    if explicit is not None and str(explicit).strip() != "":
        vol = _num(explicit, default_music)
        return max(vol, 0.0)
    return default_music


def _clip_list_json(output: dict[str, Any]) -> Any:
    raw = field(output, "Render_Clip_List_JSON")
    parsed = parse_json_field(raw)
    return parsed if parsed is not None else raw


def voiceover_url(output: dict[str, Any], content_item: dict[str, Any] | None = None) -> str:
    return field_str(output, "Voiceover_URL") or field_str(content_item or {}, "Voiceover_URL")


def voiceover_is_required(output: dict[str, Any], content_item: dict[str, Any] | None = None) -> bool:
    mode = (
        field_str(output, "Studio_Effective_Voiceover_Mode")
        or field_str(content_item or {}, "Include_Voiceover")
    ).strip().lower()
    return mode in {"yes", "true", "1"}


def duration_is_explicit(output: dict[str, Any]) -> bool:
    override = field(output, "Video_Duration_Seconds_Override")
    if override is not None and str(override).strip() != "":
        return True
    # Owner-set PR duration (Studio_Effective / request copy) must pad to full length
    # even when voiceover is shorter — otherwise Remotion collapses to VO+tail (~10s).
    effective = field(output, "Studio_Effective_Video_Duration_Seconds")
    try:
        if effective is not None and str(effective).strip() != "" and float(effective) > 0:
            return True
    except (TypeError, ValueError):
        pass
    return False


def attach_voiceover(
    payload: dict[str, Any],
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    *,
    default_voice: float,
    url: str | None = None,
) -> dict[str, Any]:
    vo = (url or voiceover_url(output, content_item)).strip()
    if not vo:
        return payload
    volume = _num(field(output, "Voiceover_Render_Volume"), default_voice)
    payload["voiceover"] = {"url": vo, "volume": volume}
    payload["voiceoverUrl"] = vo
    payload["durationIsExplicit"] = duration_is_explicit(output)
    if "voiceoverTailSeconds" not in payload:
        payload["voiceoverTailSeconds"] = _num(field(output, "Voiceover_Tail_Seconds"), 2)
    if content_item and not payload.get("voiceoverText"):
        payload["voiceoverText"] = field_str(content_item, "Voiceover_Script")
    return payload


def _black_frame_guard(output: dict[str, Any]) -> dict[str, Any]:
    cover = _cover_url(output)
    return {
        "enabled": True,
        "fallbackFrameSeconds": 1,
        "fallbackUrl": cover,
    }


def build_p020_request(output: dict[str, Any], *, default_music: float) -> dict[str, Any]:
    width, height = _dimensions(field_str(output, "Aspect_Ratio"))
    music_url = field_str(output, "Music_URL")
    music_enabled = bool(music_url)
    music_volume = _music_volume(output, default_music)
    ducked = _num(field(output, "Music_Ducked_Volume"), 0.084)
    ducking_enabled = field(output, "Music_Ducking_Enabled") is not False
    duck_fade = int(_num(field(output, "Music_Duck_Fade_Frames"), 6))
    duck_multiplier = (ducked / music_volume) if music_volume > 0 and ducking_enabled else 0
    cover = _cover_url(output)
    total_frames = int(_num(field(output, "Render_Total_Frames"), 0))
    return {
        "filename": field_str(output, "Output_Filename"),
        "compositionId": field_str(output, "Composition_ID"),
        "titleText": field_str(output, "Title_Text"),
        "brandText": field_str(output, "Brand_Text"),
        "coverUrl": cover,
        "thumbnailUrl": cover,
        "initialFramePolicy": "first_visual_frame",
        "blackFrameGuard": _black_frame_guard(output),
        "expectedClipCount": int(_num(field(output, "Selected_Clip_Count"), 0)),
        "fps": 30,
        "width": width,
        "height": height,
        "durationInFrames": total_frames,
        "durationSeconds": total_frames / 30,
        "voiceoverTailSeconds": _num(field(output, "Voiceover_Tail_Seconds"), 2),
        "durationIsExplicit": duration_is_explicit(output),
        "clips": _clip_list_json(output),
        "music": _with_music_start({
            "enabled": music_enabled,
            "url": music_url,
            "volume": music_volume,
            "duckingEnabled": ducking_enabled,
            "duckingMultiplier": duck_multiplier,
            "duckFadeFrames": duck_fade,
            "fadeInFrames": 15,
            "fadeOutFrames": 15,
            "loop": True,
        }, output),
    }


def build_voiceover_request(
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    *,
    default_music: float,
    default_voice: float,
) -> dict[str, Any]:
    width, height = _dimensions(field_str(output, "Aspect_Ratio"))
    music_url = field_str(output, "Music_URL")
    music_volume = _music_volume(output, default_music) if music_url else 0.0
    voice_volume = _num(field(output, "Voiceover_Render_Volume"), default_voice)
    clip_json = json.dumps(_clip_list_json(output) or [])
    spoken_disabled = "overlay" in clip_json.lower()
    cover = _cover_url(output)
    total_frames = int(_num(field(output, "Render_Total_Frames"), 0))
    return {
        "filename": field_str(output, "Output_Filename"),
        "compositionId": field_str(output, "Composition_ID"),
        "titleText": field_str(output, "Title_Text"),
        "brandText": field_str(output, "Brand_Text"),
        "coverUrl": cover,
        "thumbnailUrl": cover,
        "initialFramePolicy": "first_visual_frame",
        "blackFrameGuard": _black_frame_guard(output),
        "voiceoverText": field_str(content_item or {}, "Voiceover_Script"),
        "spokenCaptionsEnabled": not spoken_disabled,
        "spokenCaptionWordsPerPage": 4,
        "expectedClipCount": int(_num(field(output, "Selected_Clip_Count"), 0)),
        "fps": 30,
        "width": width,
        "height": height,
        "durationInFrames": total_frames,
        "durationSeconds": round(total_frames / 30),
        "voiceoverTailSeconds": _num(field(output, "Voiceover_Tail_Seconds"), 2),
        "durationIsExplicit": duration_is_explicit(output),
        "clips": _clip_list_json(output),
        "music": _with_music_start({"url": music_url, "volume": music_volume}, output, content_item),
        "voiceover": {
            "url": voiceover_url(output, content_item),
            "volume": voice_volume,
        },
        "voiceoverUrl": voiceover_url(output, content_item),
    }


def build_no_voiceover_request(output: dict[str, Any], *, default_music: float) -> dict[str, Any]:
    width, height = _dimensions(field_str(output, "Aspect_Ratio"))
    music_url = field_str(output, "Music_URL")
    music_volume = _music_volume(output, default_music) if music_url else 0.0
    cover = _cover_url(output)
    total_frames = int(_num(field(output, "Render_Total_Frames"), 0))
    return {
        "filename": field_str(output, "Output_Filename"),
        "compositionId": field_str(output, "Composition_ID"),
        "titleText": field_str(output, "Title_Text"),
        "brandText": field_str(output, "Brand_Text"),
        "coverUrl": cover,
        "thumbnailUrl": cover,
        "initialFramePolicy": "first_visual_frame",
        "blackFrameGuard": _black_frame_guard(output),
        "expectedClipCount": int(_num(field(output, "Selected_Clip_Count"), 0)),
        "fps": 30,
        "width": width,
        "height": height,
        "durationInFrames": total_frames,
        "durationSeconds": round(total_frames / 30),
        "clips": _clip_list_json(output),
        "music": _with_music_start({"url": music_url, "volume": music_volume}, output),
    }


def choose_render_request(
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    *,
    default_music: float,
    default_voice: float,
) -> tuple[str, dict[str, Any]]:
    vo = voiceover_url(output, content_item)
    if field_str(output, "Creative_Render_Manifest_JSON"):
        payload = build_p020_request(output, default_music=default_music)
        if vo:
            attach_voiceover(
                payload,
                output,
                content_item,
                default_voice=default_voice,
                url=vo,
            )
        return "p020_manifest", payload
    if vo:
        return "voiceover", build_voiceover_request(
            output,
            content_item,
            default_music=default_music,
            default_voice=default_voice,
        )
    return "no_voiceover", build_no_voiceover_request(output, default_music=default_music)
