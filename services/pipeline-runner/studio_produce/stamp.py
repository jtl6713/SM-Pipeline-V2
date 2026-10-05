from __future__ import annotations

import json
import math
import re
from typing import TYPE_CHECKING, Any
from urllib.parse import unquote

from studio_produce.constants import CONTENT_ITEMS_TABLE, PLATFORM_OUTPUTS_TABLE, PRODUCTION_REQUESTS_TABLE
from audio.voiceover_duration import measured_voiceover_seconds
from render.fields import field, field_str, first_linked_id
from studio_produce.constants import NATIVE_OUTPUT_TYPES, STORY_OUTPUT_TYPES
from studio_produce.context import expected_photo_count, master_assets, variant_manifest
from studio_produce.job import finished_origin_kind, parse_json
from studio_produce.thumbnail import is_designed_cover_url
from studio_produce.timed_script import (
    segment_duration_frames,
    still_name_matches,
    timed_script_from_request,
)
from studio_produce.media import (
    asset_is_video,
    asset_media_kind,
    clip_in_out_seconds,
    distribute_frames,
    drive_download_url,
    playable_url,
    remotion_clip_url,
    source_duration_seconds,
)

if TYPE_CHECKING:
    from airtable.client import AirtableClient


STORY_TEASER_SECONDS = 10
SINGLE_STILL_SECONDS = 5
PHOTO_FLOOR_SECONDS = 3
FPS = 30

_RENDER_SETTINGS_RE = re.compile(r"(?:^|\n)\[render-settings\]\s*([^\n]*)", re.I)
_RENDER_OVERRIDES_RE = re.compile(r"(?:^|\n)\[render-overrides\]\s*([^\n]*)", re.I)
_RENDER_DEFAULTS = {
    "preset": "auto",
    "motion": "auto",
    "transition": "auto",
    "transition_seconds": "",
    "duration_mode": "auto",
    "duration_seconds": "3",
    "intensity": "normal",
    "pacing": "normal",
    "fit": "smart_crop",
    "beat_sync": "on",
    "ai_motion": "off",
}
_RENDER_PRESETS = {
    "cinematic": {
        "motion": "ken_burns",
        "transition": "crossfade",
        "transition_seconds": "0.6",
        "intensity": "subtle",
        "pacing": "relaxed",
        "fit": "smart_crop",
        "beat_sync": "on",
    },
    "elegant": {
        "motion": "slow_zoom_in",
        "transition": "dissolve",
        "transition_seconds": "0.65",
        "intensity": "subtle",
        "pacing": "relaxed",
        "fit": "smart_crop",
        "beat_sync": "on",
    },
    "energetic": {
        "motion": "ken_burns",
        "transition": "push",
        "transition_seconds": "0.3",
        "intensity": "dramatic",
        "pacing": "fast",
        "fit": "cover",
        "beat_sync": "on",
    },
    "documentary": {
        "motion": "pan_right",
        "transition": "crossfade",
        "transition_seconds": "0.45",
        "intensity": "subtle",
        "pacing": "normal",
        "fit": "smart_crop",
        "beat_sync": "on",
    },
    "minimal": {
        "motion": "static",
        "transition": "crossfade",
        "transition_seconds": "0.35",
        "intensity": "subtle",
        "pacing": "relaxed",
        "fit": "contain",
        "beat_sync": "off",
    },
}


def render_settings_from_request(request: dict[str, Any] | None) -> dict[str, str]:
    settings = dict(_RENDER_DEFAULTS)
    notes = field_str(request or {}, "Production_Notes")
    match = _RENDER_SETTINGS_RE.search(notes)
    if not match:
        return settings

    parsed: dict[str, str] = {}
    for part in str(match.group(1) or "").split(";"):
        key, sep, value = part.partition("=")
        key = key.strip().lower()
        value = value.strip().lower()
        if sep and key in settings and value:
            parsed[key] = value

    preset = parsed.get("preset", "auto")
    if preset in _RENDER_PRESETS:
        settings.update(_RENDER_PRESETS[preset])
    settings.update(parsed)
    return settings


def render_overrides_from_request(request: dict[str, Any] | None) -> dict[str, dict[str, str]]:
    notes = field_str(request or {}, "Production_Notes")
    match = _RENDER_OVERRIDES_RE.search(notes)
    if not match:
        return {}
    try:
        parsed = json.loads(unquote(str(match.group(1) or "").strip()))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    allowed = {"motion", "transition", "fit"}
    cleaned: dict[str, dict[str, str]] = {}
    for raw_asset_id, raw_value in parsed.items():
        asset_id = str(raw_asset_id or "").strip()
        if not asset_id or not isinstance(raw_value, dict):
            continue
        value = {
            str(key).strip(): str(item or "").strip().lower()
            for key, item in raw_value.items()
            if str(key).strip() in allowed and str(item or "").strip()
        }
        if value:
            cleaned[asset_id] = value
    return cleaned


def _render_override_for_item(
    overrides: dict[str, dict[str, str]],
    item: dict[str, Any],
) -> dict[str, str]:
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    for candidate in (
        source.get("id"),
        source.get("media_asset_record_id"),
        item.get("media_asset_id"),
    ):
        key = str(candidate or "").strip()
        if key and key in overrides:
            return dict(overrides[key])
    return {}


_AI_MOTION_CHOICES = {
    "static",
    "ken_burns",
    "slow_zoom_in",
    "slow_zoom_out",
    "pan_left",
    "pan_right",
    "pan_up",
    "pan_down",
}
_AI_MOTION_CACHE: dict[str, dict[int, dict[str, str]]] = {}


def _ai_directed_motion(
    clips: list[dict[str, Any]],
    settings: dict[str, str],
    overrides: dict[str, dict[str, str]],
) -> dict[int, dict[str, str]]:
    if settings.get("ai_motion", "off") != "on":
        return {}
    pending: list[tuple[int, dict[str, Any]]] = []
    for index, item in enumerate(clips):
        if item.get("media_kind") == "video":
            continue
        if _render_override_for_item(overrides, item).get("motion"):
            continue
        if str(item.get("url") or "").startswith(("http://", "https://")):
            pending.append((index, item))
    if not pending:
        return {}

    cache_key = json.dumps(
        {
            "clips": [(index, str(item.get("url") or "")) for index, item in pending],
            "preset": settings.get("preset", "auto"),
            "intensity": settings.get("intensity", "normal"),
            "pacing": settings.get("pacing", "normal"),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    cached = _AI_MOTION_CACHE.get(cache_key)
    if cached is not None:
        return {index: dict(value) for index, value in cached.items()}

    directed: dict[int, dict[str, str]] = {}
    try:
        from a3.openai_classify import classify_asset
    except Exception:
        return {}

    for offset in range(0, len(pending), 8):
        batch = pending[offset:offset + 8]
        prompt = (
            "You are a social-video motion director. Examine the still images in the exact order supplied. "
            "Choose one tasteful motion for each image from: static, ken_burns, slow_zoom_in, slow_zoom_out, "
            "pan_left, pan_right, pan_up, pan_down. Preserve faces, signs, architecture, and important text; "
            "prefer static or a gentle zoom for text-heavy images, and use directional pans only when the "
            "composition clearly benefits. Avoid repeating the same move unnecessarily. "
            f"Global preset={settings.get('preset','auto')}, intensity={settings.get('intensity','normal')}, "
            f"pacing={settings.get('pacing','normal')}. "
            'Return JSON only as {"motions":[{"index":1,"motion":"slow_zoom_in","reason":"short reason"}]}. '
            "Index is 1-based within this batch and every supplied image must have one entry."
        )
        try:
            result = classify_asset(
                prompt,
                image_urls=[str(item.get("url") or "") for _, item in batch],
                max_output_tokens=1600,
            )
            parsed = result.get("parsed") if isinstance(result, dict) else {}
            rows = parsed.get("motions") if isinstance(parsed, dict) else []
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                local_index = int(row.get("index") or 0) - 1
            except (TypeError, ValueError):
                continue
            if local_index < 0 or local_index >= len(batch):
                continue
            motion = str(row.get("motion") or "").strip().lower()
            if motion not in _AI_MOTION_CHOICES:
                continue
            global_index = batch[local_index][0]
            directed[global_index] = {
                "motion": motion,
                "reason": str(row.get("reason") or "").strip()[:240],
            }
    if directed:
        if len(_AI_MOTION_CACHE) >= 128:
            _AI_MOTION_CACHE.pop(next(iter(_AI_MOTION_CACHE)))
        _AI_MOTION_CACHE[cache_key] = {index: dict(value) for index, value in directed.items()}
    return directed


def _render_float(settings: dict[str, str], key: str, default: float = 0.0) -> float:
    try:
        return float(settings.get(key) or default)
    except (TypeError, ValueError):
        return default


def _render_motion(settings: dict[str, str], index: int, *, story: bool, video: bool) -> str:
    if video:
        return "none"
    motion = settings.get("motion", "auto")
    if motion == "auto":
        return "slowZoom" if story else "none"
    if motion == "static":
        return "none"
    if motion == "slow_zoom_in":
        return "slowZoom"
    if motion == "slow_zoom_out":
        return "slowZoomOut"
    if motion == "pan_left":
        return "panLeft"
    if motion == "pan_right":
        return "panRight"
    if motion == "pan_up":
        return "panUp"
    if motion == "pan_down":
        return "panDown"
    if motion == "ken_burns":
        return "kenBurnsLeft" if index % 2 == 0 else "kenBurnsRight"
    return "slowZoom" if story else "none"


def _render_fit(settings: dict[str, str], *, story: bool, video: bool) -> str | None:
    if video:
        return None
    fit = settings.get("fit", "smart_crop")
    if fit == "cover":
        return "fill_crop"
    if fit == "contain":
        return "full_with_solid_background"
    # Smart crop intentionally preserves the proven legacy route. Stories fill;
    # other photo videos show the full prepared variant on a solid background.
    return "fill_crop" if story else "full_with_solid_background"


def _render_transition(settings: dict[str, str], index: int) -> dict[str, Any] | None:
    transition = settings.get("transition", "auto")
    if transition == "auto":
        return None
    mapping = {
        "crossfade": "fade",
        "dissolve": "dissolve",
        "zoom": "zoom",
        "blur_fade": "blurFade",
        "dip_black": "dipBlack",
        "none": "none",
    }
    if transition == "slide":
        kind = "slideLeft" if index % 2 == 0 else "slideRight"
    elif transition == "push":
        kind = "pushLeft" if index % 2 == 0 else "pushRight"
    else:
        kind = mapping.get(transition, "fade")
    result: dict[str, Any] = {"type": kind}
    seconds = _render_float(settings, "transition_seconds", 0)
    if seconds > 0:
        result["durationFrames"] = max(1, round(seconds * FPS))
    elif settings.get("pacing") in {"relaxed", "fast"}:
        factor = 1.2 if settings.get("pacing") == "relaxed" else 0.75
        result["durationFrames"] = max(1, round(12 * factor))
    return result


def is_native_photo(platform: str, output_type: str, mapping: str = "") -> bool:
    platform = str(platform or "").strip()
    output_type = str(output_type or "").strip()
    mapping = str(mapping or "").strip()
    if output_type in STORY_OUTPUT_TYPES:
        return False
    if platform == "TikTok" and output_type in {"Multi-Photo", "Single Photo", *NATIVE_OUTPUT_TYPES}:
        return output_type in {"Multi-Photo", "Single Photo"} or mapping == "TikTok Slideshow"
    if platform == "Instagram" and (
        output_type in {"Carousel", "Single Image", "Instagram Feed Post", *NATIVE_OUTPUT_TYPES}
        or mapping in {"Instagram Carousel", "Instagram Feed Post"}
    ):
        return output_type != "Reel" and output_type not in STORY_OUTPUT_TYPES
    if platform == "Facebook" and (
        output_type in {"Multi-Image Post", "Single Image", "Facebook Post", *NATIVE_OUTPUT_TYPES}
        or mapping in {"Facebook Photo Set", "Facebook Post"}
    ):
        return output_type != "Slideshow Reel" and output_type not in STORY_OUTPUT_TYPES
    return output_type in NATIVE_OUTPUT_TYPES


def plan_item_for_output(request: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    plan = parse_json(field(request, "Studio_Output_Plan_JSON"), {}) or {}
    platform = field_str(output, "Platform")
    output_type = field_str(output, "Studio_Output_Type") or field_str(output, "Output_Type")
    key = f"{platform}::{output_type}"
    for item in plan.get("items") or []:
        if not isinstance(item, dict):
            continue
        if f"{item.get('platform') or ''}::{item.get('output_type') or ''}" == key:
            return item
    return {}


def directive_yes(value: Any) -> bool:
    return str(value or "").strip() != "No"


def output_effective(output: dict[str, Any], request: dict[str, Any], parent: dict[str, Any] | None) -> dict[str, Any]:
    voiceover_mode = field_str(output, "Studio_Effective_Voiceover_Mode") or field_str(request, "Voiceover_Mode") or "Yes"
    voiceover_duration = (
        field(output, "Studio_Effective_Voiceover_Duration_Seconds")
        # The parent value is measured from the actual synthesized file; the request
        # value is only the requested script target and can be shorter.
        or field(parent or {}, "Voiceover_Duration_Seconds")
        or field(request, "Voiceover_Duration_Seconds")
        or 0
    )
    if directive_yes(voiceover_mode) and not voiceover_duration and field_str(parent or {}, "Voiceover_URL"):
        voiceover_duration = measured_voiceover_seconds(output, parent, probe=True) or 0
    return {
        "platform": field_str(output, "Platform"),
        "output_type": field_str(output, "Studio_Output_Type") or field_str(output, "Output_Type"),
        "voiceover_mode": voiceover_mode,
        "thumbnail_mode": field_str(output, "Studio_Effective_Thumbnail_Mode") or field_str(request, "Thumbnail_Mode") or "Yes",
        "background_music_mode": field_str(output, "Studio_Effective_Background_Music_Mode") or field_str(request, "Background_Music_Mode") or "Yes",
        "video_duration_seconds": field(output, "Studio_Effective_Video_Duration_Seconds") or field(request, "Video_Duration_Seconds") or 0,
        "voiceover_duration_seconds": voiceover_duration,
        "voiceover_tail_seconds": field(output, "Studio_Effective_Voiceover_Tail_Seconds") if field(output, "Studio_Effective_Voiceover_Tail_Seconds") not in (None, "") else field(request, "Voiceover_Tail_Seconds") if field(request, "Voiceover_Tail_Seconds") not in (None, "") else field(parent or {}, "Voiceover_Tail_Seconds") or 0,
        "music_start_seconds": field(output, "Studio_Effective_Music_Start_Seconds") or field(request, "Music_Start_Seconds") or field(parent or {}, "Music_Start_Seconds") or 0,
        "requested_title": field_str(output, "Studio_Effective_Requested_Title") or field_str(request, "Requested_Title") or field_str(parent or {}, "Content_Title"),
        "requested_caption": field_str(output, "Studio_Effective_Requested_Caption") or field_str(request, "Requested_Caption") or field_str(parent or {}, "Caption"),
        "music_url": (
            field_str(output, "Music_URL")
            or field_str(output, "Selected_Music_URL")
            or field_str(output, "Preferred_Music_URL")
            or field_str(parent or {}, "Preferred_Music_URL")
            or field_str(parent or {}, "Music_URL")
            or field_str(parent or {}, "Selected_Music_URL")
        ),
    }


def duration_seconds(
    *,
    story: bool,
    clip_count: int,
    effective: dict[str, Any],
    request: dict[str, Any],
    output: dict[str, Any] | None = None,
) -> float:
    output_override = field(output or {}, "Video_Duration_Seconds_Override")
    try:
        if output_override and float(output_override) > 0:
            value = float(output_override)
            return min(15.0, value) if story else value
    except (TypeError, ValueError):
        pass
    if story:
        return STORY_TEASER_SECONDS
    stored = effective.get("video_duration_seconds") or field(request, "Video_Duration_Seconds") or 0
    try:
        stored_n = float(stored)
    except (TypeError, ValueError):
        stored_n = 0
    # A requested duration is a target, but narration must never be truncated.
    # Extend to the next whole frame when measured speech is longer. A stored tail is unused.
    if stored_n > 0:
        if directive_yes(effective.get("voiceover_mode")):
            try:
                voice_n = float(effective.get("voiceover_duration_seconds") or 0)
            except (TypeError, ValueError):
                voice_n = 0
            if voice_n > 0:
                # Speech length can extend the reel. A stored tail does not.
                required = math.ceil(voice_n * FPS) / FPS
                return max(stored_n, required)
        return stored_n
    if clip_count <= 1:
        return SINGLE_STILL_SECONDS
    return min(30, max(clip_count * PHOTO_FLOOR_SECONDS, 9))


def _master_for_source(masters: list[dict[str, Any]], source: dict[str, Any]) -> dict[str, Any]:
    source_id = str(source.get("id") or "")
    for master in masters:
        if str(master.get("id") or "") == source_id:
            return master
    return source


def _candidate_duration(row: dict[str, Any]) -> float:
    try:
        return float(field(row, "Duration_Seconds") or 0)
    except (TypeError, ValueError):
        return 0.0


def _required_music_seconds(request: dict[str, Any], parent: dict[str, Any] | None) -> float:
    for raw in (
        field(request, "Video_Duration_Seconds"),
        field(parent or {}, "Content_Duration"),
    ):
        try:
            value = float(raw or 0)
        except (TypeError, ValueError):
            value = 0
        if value > 0:
            return value
    return 0.0


def ensure_catalog_music(
    client: "AirtableClient",
    request: dict[str, Any],
    parent: dict[str, Any] | None,
    outputs: list[dict[str, Any]],
) -> str:
    """Resolve the promised catalog fallback before Studio Produce stamps renders."""
    wants_music = str(field_str(request, "Background_Music_Mode") or "Yes").strip().lower() not in {"no", "false", "0"}
    if not wants_music:
        return ""

    for output in outputs:
        existing = output_effective(output, request, parent).get("music_url")
        if existing:
            return str(existing)

    from r2.candidates import fetch_music_candidates
    from r2.constants import MEDIA_ASSETS_TABLE

    selected_id = first_linked_id(field(request, "Selected_Music_Asset"))
    if not selected_id and parent:
        selected_id = first_linked_id(field(parent, "Preferred_Music_Asset"))

    chosen = None
    if selected_id:
        try:
            selected = client.get_record(MEDIA_ASSETS_TABLE, selected_id)
            if field_str(selected, "Google Drive URL"):
                chosen = selected
        except Exception:
            chosen = None

    if chosen is None:
        candidates = fetch_music_candidates(client)
        required = _required_music_seconds(request, parent)
        duration_ok = [
            row for row in candidates
            if _candidate_duration(row) <= 0 or _candidate_duration(row) + 0.05 >= required
        ]
        pool = duration_ok or candidates
        if pool:
            pool = sorted(
                pool,
                key=lambda row: (
                    0 if field(row, "Studio_Favorite") is True else 1,
                    abs((_candidate_duration(row) or required) - required) if required else 0,
                    field_str(row, "Asset Name").lower(),
                ),
            )
            chosen = pool[0]

    if not chosen:
        return ""

    music_id = str(chosen.get("id") or "").strip()
    music_url = field_str(chosen, "Google Drive URL")
    if not music_id or not music_url:
        return ""

    request_patch = {"Selected_Music_Asset": [music_id]}
    client.update_record(PRODUCTION_REQUESTS_TABLE, request["id"], request_patch, typecast=True)
    request.setdefault("fields", {}).update(request_patch)

    if parent:
        parent_patch = {
            "Preferred_Music_Asset": [music_id],
            "Preferred_Music_URL": music_url,
            "Music_URL": music_url,
        }
        client.update_record(CONTENT_ITEMS_TABLE, parent["id"], parent_patch, typecast=True)
        parent.setdefault("fields", {}).update(parent_patch)

    return music_url


def _clip_matches_asset(clip: dict[str, Any], asset_id: str) -> bool:
    wanted = str(asset_id or "").strip()
    if not wanted:
        return False
    source = clip.get("source") if isinstance(clip.get("source"), dict) else {}
    candidates = {
        str(source.get("id") or "").strip(),
        str(source.get("media_asset_record_id") or "").strip(),
        str(clip.get("media_asset_id") or "").strip(),
    }
    candidates.discard("")
    return wanted in candidates


def _clip_as_named_asset(clip: dict[str, Any]) -> dict[str, Any]:
    source = clip.get("source") if isinstance(clip.get("source"), dict) else {}
    return {
        "id": source.get("id") or clip.get("media_asset_id") or "",
        "name": source.get("name") or source.get("file_name") or clip.get("asset_name") or "",
        "file_name": source.get("file_name") or "",
        "caption": source.get("caption") or "",
        "asset_name": clip.get("asset_name") or "",
        "media_asset_record_id": source.get("media_asset_record_id") or "",
    }


def _clip_identity(clip: dict[str, Any]) -> str:
    source = clip.get("source") if isinstance(clip.get("source"), dict) else {}
    return str(
        source.get("id")
        or source.get("media_asset_record_id")
        or clip.get("media_asset_id")
        or id(clip)
    )


def clips_for_timed_script(
    clips: list[dict[str, Any]],
    timeline: dict[str, Any] | None,
) -> list[dict[str, Any]] | None:
    """Order stills by the imported timeline. Extra attached photos are ignored.

    Prefer each scene's asset_id, then Suggested still name, then leftover master
    order. Unresolved scenes still refuse the stamp.
    """
    segments = (timeline or {}).get("segments") if isinstance(timeline, dict) else None
    if not isinstance(segments, list) or not segments:
        return clips
    remaining = list(clips or [])
    picked: list[dict[str, Any] | None] = [None] * len(segments)

    def pull(index: int, match: dict[str, Any] | None) -> None:
        if not match or picked[index] is not None:
            return
        copied = dict(match)
        copied["timed_segment"] = segments[index]
        picked[index] = copied
        identity = _clip_identity(match)
        remaining[:] = [clip for clip in remaining if _clip_identity(clip) != identity]

    for index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            return None
        wanted = str(segment.get("asset_id") or "").strip()
        if not wanted:
            continue
        match = next((clip for clip in remaining if _clip_matches_asset(clip, wanted)), None)
        pull(index, match)

    for index, segment in enumerate(segments):
        if picked[index] is not None:
            continue
        match = next(
            (
                clip
                for clip in remaining
                if still_name_matches(segment.get("suggested_visual"), _clip_as_named_asset(clip))
            ),
            None,
        )
        pull(index, match)

    for index, segment in enumerate(segments):
        if picked[index] is not None or not remaining:
            continue
        pull(index, remaining[0])

    if any(item is None for item in picked):
        return None
    return picked


def _music_requested(effective: dict[str, Any]) -> bool:
    mode = str(effective.get("background_music_mode") or "").strip().lower()
    if mode in {"no", "false", "0"}:
        return False
    return bool(effective.get("music_url"))


def assign_clip_frames(
    clips: list[dict[str, Any]],
    *,
    story: bool,
    effective: dict[str, Any],
    request: dict[str, Any],
    output: dict[str, Any] | None,
) -> tuple[list[int], int]:
    kinds = [asset_media_kind(item.get("source") or item) for item in clips]
    video_indexes = [index for index, kind in enumerate(kinds) if kind == "video"]
    photo_indexes = [index for index, kind in enumerate(kinds) if kind != "video"]
    frames = [0] * len(clips)
    render_settings = render_settings_from_request(request)
    native_video = []
    for index in video_indexes:
        source = clips[index].get("source") or {}
        start, end = clip_in_out_seconds(source)
        native_video.append(max(1, round((end - start) * FPS)))
        frames[index] = native_video[-1]
    video_total = sum(native_video)
    timeline = None if story or video_indexes else timed_script_from_request(request)
    if timeline and len(timeline.get("segments") or []) == len(clips):
        # Timed-script scene windows win over pacing/fixed/owner length.
        # After P2, those windows are measured VO lengths (not raw import clocks).
        frames = [segment_duration_frames(segment) for segment in timeline["segments"]]
        if frames and all(frame >= 1 for frame in frames):
            return frames, sum(frames)
    photo_voice = (
        not story
        and not video_indexes
        and directive_yes(effective.get("voiceover_mode"))
    )
    if photo_voice and photo_indexes:
        try:
            voice_n = float(effective.get("voiceover_duration_seconds") or 0)
        except (TypeError, ValueError):
            voice_n = 0
        if voice_n > 0:
            # No per-slide timeline yet. Split the measured speech. Do not pad
            # out to a stored video duration or a tail.
            target = max(len(photo_indexes), round(voice_n * FPS))
            allocated = distribute_frames([1] * len(photo_indexes), target)
            for position, index in enumerate(photo_indexes):
                frames[index] = allocated[position]
            return frames, sum(frames)
    if render_settings.get("duration_mode") == "fixed" and photo_indexes:
        fixed_seconds = max(1.0, min(15.0, _render_float(render_settings, "duration_seconds", 3.0)))
        fixed_frames = max(1, round(fixed_seconds * FPS))
        for index in photo_indexes:
            frames[index] = fixed_frames
        total = sum(frames)
        return frames, max(1, total)

    owner = duration_seconds(
        story=story,
        clip_count=len(clips),
        effective=effective,
        request=request,
        output=output,
    )
    stored = effective.get("video_duration_seconds") or 0
    try:
        owner_set = float(stored) > 0
    except (TypeError, ValueError):
        owner_set = False
    if story:
        target = max(len(clips), round(owner * FPS))
    elif owner_set:
        target = max(len(clips), round(float(stored) * FPS))
    else:
        pacing = render_settings.get("pacing", "normal")
        pace_factor = 1.2 if pacing == "relaxed" else (0.8 if pacing == "fast" else 1.0)
        photo_seconds = PHOTO_FLOOR_SECONDS * pace_factor * max(1, len(photo_indexes)) if photo_indexes else 0
        target = video_total + max(len(photo_indexes), round(photo_seconds * FPS))
        if not video_indexes:
            target = max(len(clips), round(owner * FPS))
    cap = story or owner_set
    if cap:
        photo_floor = round(PHOTO_FLOOR_SECONDS * FPS) * len(photo_indexes) if photo_indexes else 0
        min_video = len(video_indexes)
        min_photo = len(photo_indexes)
        if photo_indexes and video_indexes:
            photo_budget = max(min_photo, min(photo_floor, target - min_video))
            video_budget = max(min_video, target - photo_budget)
        elif photo_indexes:
            photo_budget = target
            video_budget = 0
        else:
            photo_budget = 0
            video_budget = target
        if video_indexes:
            if video_total <= video_budget:
                for position, index in enumerate(video_indexes):
                    frames[index] = native_video[position]
                if photo_indexes:
                    photo_budget = max(min_photo, target - video_total)
                else:
                    target = video_total
            else:
                allocated = distribute_frames(native_video, video_budget)
                for position, index in enumerate(video_indexes):
                    frames[index] = allocated[position]
        if photo_indexes:
            allocated = distribute_frames([1] * len(photo_indexes), max(min_photo, photo_budget))
            for position, index in enumerate(photo_indexes):
                frames[index] = allocated[position]
        total = sum(frames) or max(1, target)
        if cap and photo_indexes and total != target:
            delta = target - total
            frames[photo_indexes[-1]] = max(1, frames[photo_indexes[-1]] + delta)
            total = sum(frames)
        return frames, total
    remaining = max(len(photo_indexes), target - video_total) if photo_indexes else 0
    if photo_indexes:
        allocated = distribute_frames([1] * len(photo_indexes), remaining)
        for position, index in enumerate(photo_indexes):
            frames[index] = allocated[position]
    total = sum(frames) or max(1, target)
    return frames, total


def overlay_from_caption(text: str) -> dict[str, Any] | None:
    overlay_text = str(text or "").strip()
    if not overlay_text:
        return None
    return {
        "enabled": True,
        "text": overlay_text,
        "role": "caption",
        "position": "lower-third",
        "size": 52,
        "stylePreset": "Lower Third / Minimal",
        "animation": "fade",
        "startFraction": 0,
        "endFraction": 1,
        "backgroundOpacity": 0.4,
    }


def collapse_repeated_scene_caption_overlays(clips: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep one intro lower-third when every scene repeats the same caption.

    Variant/asset metadata can accidentally stamp the parent title onto every
    photo. Rendering that as a scene caption produces a lower-third covering
    the entire Reel/Short. A repeated identical caption across every clip is
    treated as one intro label; genuinely different per-scene captions remain.
    """
    rows = list(clips or [])
    if len(rows) < 2:
        return rows
    texts = []
    for clip in rows:
        overlay = clip.get("overlay") if isinstance(clip.get("overlay"), dict) else {}
        texts.append(str(overlay.get("text") or clip.get("caption") or "").strip())
    nonempty = [text for text in texts if text]
    if len(nonempty) != len(rows) or len(set(nonempty)) != 1:
        return rows
    for index, clip in enumerate(rows):
        if index == 0:
            continue
        clip["overlay"] = None
        clip["caption"] = ""
    return rows


def pick_variant(source: dict[str, Any], ratio: str) -> dict[str, Any] | None:
    variants = source.get("variants") if isinstance(source.get("variants"), dict) else {}
    wanted = str(ratio or "").replace("x", ":")
    aliases = {
        "9:16": ["9:16", "9x16"],
        "16:9": ["16:9", "16x9"],
        "4:5": ["4:5", "4x5"],
        "1:1": ["1:1", "1x1"],
    }
    for key in aliases.get(wanted, [wanted]):
        variant = variants.get(key)
        if _renderable(variant):
            return variant
        for existing, item in variants.items():
            if str(existing).replace("x", ":") == wanted and _renderable(item):
                return item
    for item in variants.values():
        if _renderable(item):
            return item
    return None


def _renderable(variant: Any) -> bool:
    if not isinstance(variant, dict):
        return False
    url = str(variant.get("preview_url") or "").strip()
    media_id = str(variant.get("media_asset_record_id") or "").strip()
    return bool(url) and media_id.startswith("rec")


def _public_master_url(master: dict[str, Any]) -> str:
    from ap0.public_mp4 import existing_finished_preview_url

    return existing_finished_preview_url(master) or str(master.get("url") or master.get("preview_url") or "").strip()


def _public_cdn_url(value: Any) -> str:
    url = str(value or "").strip()
    return url if url.startswith("https://media.chicagoshining.com/") else ""


def _is_derived_fill_crop_url(url: str) -> bool:
    lower = str(url or "").lower()
    return "fill-crop" in lower or "item4-variant" in lower


def _clip_still_urls(raw: Any) -> set[str]:
    parsed = raw
    if isinstance(raw, str):
        parsed = parse_json(raw, []) or []
    urls: set[str] = set()
    for clip in parsed if isinstance(parsed, list) else []:
        if not isinstance(clip, dict):
            continue
        url = str(clip.get("url") or clip.get("src") or "").strip()
        kind = str(clip.get("media_kind") or clip.get("mediaKind") or "").lower()
        if not url:
            continue
        if kind == "photo" or _is_derived_fill_crop_url(url):
            urls.add(url)
    return urls


def _clip_overlay_texts(raw: Any) -> list[str]:
    parsed = raw
    if isinstance(raw, str):
        parsed = parse_json(raw, []) or []
    texts: list[str] = []
    for clip in parsed if isinstance(parsed, list) else []:
        if not isinstance(clip, dict):
            continue
        overlay = clip.get("overlay") if isinstance(clip.get("overlay"), dict) else {}
        text = str(overlay.get("text") or clip.get("caption") or "").strip()
        texts.append(text)
    return texts


def _clip_overlay_signature(raw: Any) -> tuple[str, ...]:
    parsed = raw
    if isinstance(raw, str):
        parsed = parse_json(raw, []) or []
    signature: list[str] = []
    for clip in parsed if isinstance(parsed, list) else []:
        if not isinstance(clip, dict):
            continue
        overlay = clip.get("overlay") if isinstance(clip.get("overlay"), dict) else {}
        signature.append(str(overlay.get("text") or clip.get("caption") or "").strip())
    return tuple(signature)


def _clip_render_signature(raw: Any) -> tuple[str, ...]:
    parsed = raw
    if isinstance(raw, str):
        parsed = parse_json(raw, []) or []
    signature: list[str] = []
    for clip in parsed if isinstance(parsed, list) else []:
        if not isinstance(clip, dict):
            continue
        render_bits = {
            "durationFrames": clip.get("durationFrames"),
            "motionStyle": clip.get("motionStyle"),
            "motion": clip.get("motion"),
            "transition": clip.get("transition"),
            "renderDirective": clip.get("renderDirective"),
            "beatSync": clip.get("beatSync", True),
            "fitMode": clip.get("fitMode"),
        }
        signature.append(json.dumps(render_bits, sort_keys=True, separators=(",", ":")))
    return tuple(signature)


def _remotion_fetchable(url: str) -> bool:
    value = str(url or "").strip()
    return value.startswith(("http://", "https://")) and not value.startswith("/api/media-assets/")


def photo_sequence_url(master: dict[str, Any], variant: dict[str, Any] | None) -> str:
    """Prefer the original still. Derived 9:16 fill-crops cut square/4:5 flyers.

    Master preview_url is sometimes itself an ITEM4 fill-crop JPEG (HEIC originals
    are not browser-safe). That URL must not win over a recropped variant.
    """
    original = _public_cdn_url(master.get("preview_url"))
    if original and not _is_derived_fill_crop_url(original):
        return original
    variant_url = str((variant or {}).get("preview_url") or "").strip()
    if _remotion_fetchable(variant_url):
        return variant_url
    url = playable_url(master)
    if _remotion_fetchable(url):
        return url
    return drive_download_url(master, variant) or ""


def finished_source_package(
    request: dict[str, Any],
    output: dict[str, Any],
    parent: dict[str, Any] | None,
) -> dict[str, Any] | None:
    kind = finished_origin_kind(request.get("fields") or request)
    if not kind:
        notes = str(field(request, "Production_Notes") or "")
        kind = "finished-video" if "ez-input=finished-video" in notes else (
            "finished-stills" if "ez-input=finished-stills" in notes or "ez-input=finished-carousel" in notes else ""
        )
    if not kind:
        return None
    masters = master_assets(request)
    if not masters:
        return None
    effective = output_effective(output, request, parent)
    plan_item = plan_item_for_output(request, output)
    ratio = str(plan_item.get("aspect_ratio") or field_str(output, "Aspect_Ratio") or "").strip()
    if kind == "finished-video":
        ratio = ratio or "9:16"
        chosen = next(
            (
                item for item in masters
                if str(item.get("mime_type") or "").lower().startswith("video/")
                or str(item.get("name") or "").lower().endswith((".mp4", ".mov", ".m4v", ".webm"))
            ),
            masters[0],
        )
        masters = [chosen]
    else:
        ratio = ratio or ("4:5" if len(masters) == 1 else "1:1")
        masters = [
            item for item in masters
            if not str(item.get("mime_type") or "").lower().startswith("video/")
        ] or masters
    story = effective["output_type"] in STORY_OUTPUT_TYPES
    # Finished-video Stories are short teasers (first N seconds), not full-file passthrough.
    if kind == "finished-video" and story:
        master = masters[0]
        url = _public_master_url(master)
        if not url:
            return None
        frames = int(STORY_TEASER_SECONDS * FPS)
        source_duration = float(source_duration_seconds(master, default_duration=STORY_TEASER_SECONDS) or STORY_TEASER_SECONDS)
        clip = {
            "id": "finished-story-teaser-1",
            "order": int(master.get("order") or 1),
            "media_asset_record_id": str(master.get("media_asset_record_id") or ""),
            "source_asset_id": str(master.get("id") or "") or None,
            "asset_name": str(master.get("name") or "finished-story.mp4"),
            "url": url,
            "src": url,
            "startFrame": 0,
            "durationFrames": frames,
            "motionStyle": "none",
            "fitMode": None,
            "media_kind": "video",
            "mediaKind": "video",
            "in_seconds": 0,
            "out_seconds": STORY_TEASER_SECONDS,
            "inSeconds": 0,
            "outSeconds": STORY_TEASER_SECONDS,
            "startFromSeconds": 0,
            "sourceDurationSeconds": source_duration,
            "source_duration_seconds": source_duration,
            "sourceInSeconds": 0,
            "sourceOutSeconds": min(source_duration, STORY_TEASER_SECONDS),
            "source": "finished_story_teaser",
            "aspect_ratio": ratio,
            "google_drive_file_id": str(master.get("google_drive_file_id") or "") or None,
            "overlay": None,
            "caption": "",
            "keepSourceAudio": True,
            "muted": False,
        }
        safe_type = "story"
        filename = f"studio-{field_str(request, 'Production_Request_ID') or request['id']}-{str(effective['platform'] or 'platform').lower()}-{safe_type}-teaser.mp4"
        clip_list = [{
            "id": clip["id"],
            "order": clip["order"],
            "mediaAssetRecordId": clip["media_asset_record_id"] or None,
            "assetName": clip["asset_name"],
            "url": clip["url"],
            "src": clip["src"],
            "startFrame": 0,
            "durationFrames": frames,
            "motionStyle": "none",
            "fitMode": None,
            "mediaKind": "video",
            "media_kind": "video",
            "googleDriveFileId": clip.get("google_drive_file_id") or None,
            "inSeconds": 0,
            "outSeconds": STORY_TEASER_SECONDS,
            "startFromSeconds": 0,
            "sourceDurationSeconds": source_duration,
            "sourceInSeconds": 0,
            "sourceOutSeconds": min(source_duration, STORY_TEASER_SECONDS),
            "overlay": None,
            "caption": "",
            "keepSourceAudio": True,
            "muted": False,
        }]
        selected = {
            "schema_version": "studio.source-selection.2",
            "authority": "studio_finished_story_teaser",
            "production_request_record_id": request["id"],
            "platform": effective["platform"],
            "output_type": effective["output_type"],
            "aspect_ratio": ratio,
            "selection_status": "Selected",
            "selected_clips": [clip],
            "fps": FPS,
            "target_total_frames": frames,
            "render_prep": {
                "render_status": "Ready for Render",
                "composition_id": "ChicagoShiningPhotoSequence",
                "output_filename": filename,
                "render_total_frames": frames,
                "render_clip_list_json": json.dumps(clip_list),
            },
        }
        return {
            "status": "Ready",
            "ratio": ratio,
            "clips": [clip],
            "clip_count": 1,
            "total_frames": frames,
            "composition_id": "ChicagoShiningPhotoSequence",
            "output_filename": filename,
            "selected_assets_json": json.dumps(selected),
            "render_clip_list_json": json.dumps(clip_list),
            "native": False,
            "finished": False,
            "finished_kind": kind,
            "story": True,
            "story_teaser": True,
            "effective": effective,
        }
    clips = []
    for index, master in enumerate(masters):
        url = _public_master_url(master)
        if not url:
            return None
        clips.append({
            "id": f"finished-source-{index + 1}",
            "order": int(master.get("order") or index + 1),
            "media_asset_record_id": str(master.get("media_asset_record_id") or ""),
            "source_asset_id": str(master.get("id") or "") or None,
            "asset_name": str(master.get("name") or f"finished-{index + 1}"),
            "url": url,
            "src": url,
            "startFrame": 0,
            "durationFrames": 1,
            "motionStyle": "none",
            "source": "finished_passthrough",
            "aspect_ratio": ratio,
            "google_drive_file_id": str(master.get("google_drive_file_id") or "") or None,
            "overlay": None,
            "caption": "",
        })
    if not clips:
        return None
    native = kind != "finished-video"
    selected = {
        "schema_version": "studio.source-selection.2",
        "authority": "studio_finished_passthrough",
        "production_request_record_id": request["id"],
        "platform": effective["platform"],
        "output_type": effective["output_type"],
        "aspect_ratio": ratio,
        "selection_status": "Selected",
        "selected_clips": clips,
        "fps": 30,
        "target_total_frames": 1,
        "render_prep": {
            "render_status": "Rendered" if kind == "finished-video" else "Native Photo Route",
            "composition_id": None,
            "output_filename": None,
            "render_total_frames": 1,
            "render_clip_list_json": "[]",
        },
    }
    return {
        "status": "Ready",
        "ratio": ratio,
        "clips": clips,
        "clip_count": len(clips),
        "total_frames": 1,
        "composition_id": None,
        "output_filename": None,
        "selected_assets_json": json.dumps(selected),
        "render_clip_list_json": json.dumps([
            {
                "id": clip["id"],
                "order": clip["order"],
                "mediaAssetRecordId": clip["media_asset_record_id"] or None,
                "assetName": clip["asset_name"],
                "url": clip["url"],
                "src": clip["src"],
                "startFrame": 0,
                "durationFrames": 1,
                "motionStyle": "none",
                "overlay": None,
                "caption": "",
            }
            for clip in clips
        ]),
        "native": native,
        "finished": True,
        "finished_kind": kind,
        "story": story,
        "effective": effective,
    }


def source_package(
    request: dict[str, Any],
    output: dict[str, Any],
    parent: dict[str, Any] | None,
) -> dict[str, Any] | None:
    finished = finished_source_package(request, output, parent)
    if finished:
        return finished
    if field_str(request, "Studio_Variant_Status") != "Ready":
        return None
    effective = output_effective(output, request, parent)
    plan_item = plan_item_for_output(request, output)
    ratio = str(plan_item.get("aspect_ratio") or field_str(output, "Aspect_Ratio") or "9:16").strip()
    if not ratio:
        return None
    masters = master_assets(request)
    expected = expected_photo_count(request, masters)
    if masters and len(masters) < expected:
        return None
    manifest = variant_manifest(request)
    sources = [item for item in (manifest.get("assets") or []) if isinstance(item, dict)]
    sources.sort(key=lambda item: int(item.get("order") or 0))
    story = effective["output_type"] in STORY_OUTPUT_TYPES
    if story:
        sources = sources[:1]
    elif expected and len(sources) < expected:
        return None
    captions = {
        str(asset.get("id") or ""): str(asset.get("caption") or "").strip()
        for asset in masters
        if str(asset.get("caption") or "").strip()
    }
    render_settings = render_settings_from_request(request)
    render_overrides = render_overrides_from_request(request)
    timed_script = None if story else timed_script_from_request(request)
    clips = []
    omitted = []
    has_video = False
    for source in sources:
        master = _master_for_source(masters, source)
        merged = {**master, **source}
        video = asset_is_video(merged)
        variant = pick_variant(source, ratio)
        url = remotion_clip_url(merged, variant) if video else photo_sequence_url(master, variant)
        media_id = str(
            merged.get("media_asset_record_id")
            or (variant or {}).get("media_asset_record_id")
            or ""
        ).strip()
        drive_id = str(
            (
                merged.get("google_drive_file_id")
                if (not video and _public_cdn_url(master.get("preview_url")))
                else (variant or {}).get("google_drive_file_id") or merged.get("google_drive_file_id")
            )
            or ""
        ).strip()
        frame_override = _render_override_for_item(
            render_overrides,
            {"source": merged, "media_asset_id": media_id},
        )
        fit_settings = dict(render_settings)
        if frame_override.get("fit"):
            fit_settings["fit"] = frame_override["fit"]
        fit_mode = _render_fit(fit_settings, story=story, video=video)
        if not url or not media_id.startswith("rec"):
            omitted.append(str(source.get("id") or source.get("name") or "unknown"))
            continue
        overlay_text = captions.get(str(source.get("id") or "")) or str(source.get("caption") or "").strip()
        overlay = overlay_from_caption(overlay_text)
        in_seconds, out_seconds = clip_in_out_seconds(merged)
        has_video = has_video or video
        clips.append({
            "source": merged,
            "variant": variant,
            "url": url,
            "media_asset_id": media_id,
            "drive_id": drive_id,
            "fit_mode": fit_mode,
            "overlay": overlay,
            "media_kind": "video" if video else "photo",
            "in_seconds": in_seconds,
            "out_seconds": out_seconds,
            "source_in_seconds": in_seconds,
            "source_out_seconds": out_seconds,
            "source_duration_seconds": source_duration_seconds(merged),
            "render_override": frame_override,
        })
    if omitted or not clips:
        return None
    native_route = (not has_video) and is_native_photo(
        effective["platform"],
        effective["output_type"],
        field_str(output, "Platform_Output_Type"),
    )
    ai_motion = {} if native_route else _ai_directed_motion(clips, render_settings, render_overrides)
    authoritative = bool(timed_script) and not story and not native_route and not has_video
    if authoritative:
        ordered = clips_for_timed_script(clips, timed_script)
        if not ordered:
            return None
        if any(segment_duration_frames(segment) < 1 for segment in timed_script.get("segments") or []):
            return None
        clips = ordered
    clip_frames, total_frames = assign_clip_frames(
        clips,
        story=story,
        effective=effective,
        request=request,
        output=output,
    )
    fps = FPS
    start = 0
    built = []
    for index, item in enumerate(clips):
        frames = clip_frames[index]
        overlay = item["overlay"]
        video = item["media_kind"] == "video"
        in_seconds = float(item["in_seconds"] or 0)
        out_seconds = in_seconds + (frames / fps) if video else item["out_seconds"]
        source_duration = float(item.get("source_duration_seconds") or 0) or max(out_seconds or 0, in_seconds)
        frame_override = item.get("render_override") if isinstance(item.get("render_override"), dict) else {}
        motion_settings = dict(render_settings)
        motion_source = "global"
        motion_reason = ""
        if frame_override.get("motion"):
            motion_settings["motion"] = frame_override["motion"]
            motion_source = "frame_override"
        elif index in ai_motion:
            motion_settings["motion"] = ai_motion[index]["motion"]
            motion_source = "ai"
            motion_reason = ai_motion[index].get("reason", "")
        transition_settings = dict(render_settings)
        if frame_override.get("transition"):
            transition_settings["transition"] = frame_override["transition"]
        motion_style = _render_motion(motion_settings, index, story=story, video=video)
        transition = _render_transition(transition_settings, index)
        segment = item.get("timed_segment") if isinstance(item.get("timed_segment"), dict) else None
        beat_sync = False if authoritative else render_settings.get("beat_sync", "on") != "off"
        render_directive = {
            "preset": render_settings.get("preset", "auto"),
            "motion": render_settings.get("motion", "auto"),
            "transition": render_settings.get("transition", "auto"),
            "intensity": render_settings.get("intensity", "normal"),
            "pacing": render_settings.get("pacing", "normal"),
            "fit": frame_override.get("fit") or render_settings.get("fit", "smart_crop"),
            "beatSync": beat_sync,
            "aiMotion": render_settings.get("ai_motion", "off") == "on",
            "motionSource": motion_source,
            "motionReason": motion_reason or None,
            "frameOverride": frame_override or None,
            "timingMode": "authoritative" if authoritative else None,
            "timingSource": "timed_script" if authoritative else None,
        }
        built.append({
            "id": f"studio-source-{index + 1}",
            "order": int((item["source"] or {}).get("order") or index + 1),
            "media_asset_record_id": item["media_asset_id"],
            "source_asset_id": str((item["source"] or {}).get("id") or "") or None,
            "asset_name": str((item["variant"] or {}).get("file_name") or (item["source"] or {}).get("name") or f"photo-{index + 1}.jpg"),
            "google_drive_url": str((item["variant"] or {}).get("google_drive_url") or "").strip() or None,
            "url": item["url"],
            "src": item["url"],
            "startFrame": start,
            "durationFrames": frames,
            "motionStyle": motion_style,
            "motion": {"type": motion_style, "intensity": render_settings.get("intensity", "normal")},
            "transition": transition,
            "renderDirective": render_directive,
            "beatSync": beat_sync,
            "timingMode": "authoritative" if authoritative else None,
            "timingSource": "timed_script" if authoritative else None,
            "sceneStartSeconds": None if not segment else segment.get("start_seconds"),
            "sceneEndSeconds": None if not segment else segment.get("end_seconds"),
            "voiceoverText": None if not segment else segment.get("voiceover_text") or "",
            "suggestedVisual": None if not segment else segment.get("suggested_visual") or "",
            "fitMode": item.get("fit_mode"),
            "media_kind": item["media_kind"],
            "mediaKind": item["media_kind"],
            "in_seconds": in_seconds,
            "out_seconds": out_seconds,
            "inSeconds": in_seconds,
            "outSeconds": out_seconds if video else None,
            "startFromSeconds": in_seconds if video else 0,
            "sourceDurationSeconds": source_duration if video else None,
            "source_duration_seconds": source_duration if video else None,
            "sourceInSeconds": item.get("source_in_seconds") if video else None,
            "sourceOutSeconds": item.get("source_out_seconds") if video else None,
            "source": "studio_platform_variant",
            "aspect_ratio": ratio,
            "google_drive_file_id": item["drive_id"] or None,
            "overlay": overlay or None,
            "caption": (overlay or {}).get("text") or "",
        })
        start += frames
    if not story:
        built = collapse_repeated_scene_caption_overlays(built)
    if (not story) and has_video and (not _music_requested(effective)):
        try:
            owner_set = float(effective.get("video_duration_seconds") or 0) > 0
        except (TypeError, ValueError):
            owner_set = False
        if owner_set:
            from t1.slice import expand_without_beats
            built = expand_without_beats(built, target_frames=total_frames, fps=fps)
            start = 0
            for clip in built:
                clip["startFrame"] = start
                start += int(clip.get("durationFrames") or 0)
            total_frames = sum(int(clip.get("durationFrames") or 0) for clip in built) or total_frames
    native = native_route
    composition_id = None if native else "ChicagoShiningPhotoSequence"
    safe_type = "".join(ch if ch.isalnum() else "-" for ch in effective["output_type"].lower()).strip("-") or "output"
    filename = f"studio-{field_str(request, 'Production_Request_ID') or request['id']}-{effective['platform'].lower()}-{safe_type}.mp4"
    clip_list = [
        {
            "id": clip["id"],
            "order": clip["order"],
            "mediaAssetRecordId": clip["media_asset_record_id"],
            "assetName": clip["asset_name"],
            "url": clip["url"],
            "src": clip["src"],
            "startFrame": clip["startFrame"],
            "durationFrames": clip["durationFrames"],
            "motionStyle": clip["motionStyle"],
            "motion": clip.get("motion") or None,
            "transition": clip.get("transition") or None,
            "renderDirective": clip.get("renderDirective") or None,
            "beatSync": clip.get("beatSync", True),
            "timingMode": clip.get("timingMode") or None,
            "timingSource": clip.get("timingSource") or None,
            "sceneStartSeconds": clip.get("sceneStartSeconds"),
            "sceneEndSeconds": clip.get("sceneEndSeconds"),
            "voiceoverText": clip.get("voiceoverText") or None,
            "suggestedVisual": clip.get("suggestedVisual") or None,
            "fitMode": clip.get("fitMode") or clip.get("fit_mode"),
            "mediaKind": clip.get("media_kind") or "photo",
            "media_kind": clip.get("media_kind") or "photo",
            "googleDriveFileId": clip.get("google_drive_file_id") or None,
            "inSeconds": clip.get("in_seconds") or 0,
            "outSeconds": clip.get("out_seconds") or clip.get("outSeconds"),
            "startFromSeconds": clip.get("startFromSeconds") or 0,
            "sourceDurationSeconds": clip.get("sourceDurationSeconds") or clip.get("source_duration_seconds"),
            "sourceInSeconds": clip.get("sourceInSeconds") or clip.get("source_in_seconds"),
            "sourceOutSeconds": clip.get("sourceOutSeconds") or clip.get("source_out_seconds"),
            "overlay": clip.get("overlay") or None,
            "caption": clip.get("caption") or "",
        }
        for clip in built
    ]
    selected = {
        "schema_version": "studio.source-selection.2",
        "authority": "studio_owner_uploaded_exact_source",
        "production_request_record_id": request["id"],
        "platform": effective["platform"],
        "output_type": effective["output_type"],
        "aspect_ratio": ratio,
        "selection_status": "Selected",
        "selected_clips": built,
        "fps": fps,
        "target_total_frames": total_frames,
        "render_prep": {
            "render_status": "Native Photo Route" if native else "Ready for Render",
            "composition_id": composition_id,
            "output_filename": filename,
            "render_total_frames": total_frames,
            "render_clip_list_json": json.dumps(clip_list),
        },
    }
    return {
        "status": "Ready",
        "ratio": ratio,
        "clips": built,
        "clip_count": len(built),
        "total_frames": total_frames,
        "composition_id": composition_id,
        "output_filename": filename if composition_id else None,
        "selected_assets_json": json.dumps(selected),
        "render_clip_list_json": json.dumps(clip_list),
        "native": native,
        "story": story,
        "timed_script": authoritative,
        "effective": effective,
    }


def stamp_fields(
    package: dict[str, Any],
    parent: dict[str, Any] | None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clips = package.get("clips") or []
    per = int(package["total_frames"] / package["clip_count"]) if package.get("clip_count") else 0
    native = bool(package.get("native"))
    thumb = field_str(parent or {}, "Thumbnail_URL")
    fields = {
        "Asset_Need_Status": "Not Needed",
        "Selected_Clip_1_URL": clips[0]["url"] if len(clips) > 0 else None,
        "Selected_Clip_2_URL": clips[1]["url"] if len(clips) > 1 else None,
        "Selected_Clip_3_URL": clips[2]["url"] if len(clips) > 2 else None,
        "Clip_1_URL": clips[0]["url"] if len(clips) > 0 else None,
        "Clip_2_URL": clips[1]["url"] if len(clips) > 1 else None,
        "Clip_3_URL": clips[2]["url"] if len(clips) > 2 else None,
        "Selected_Clip_1_Media_Asset_ID": clips[0]["media_asset_record_id"] if len(clips) > 0 else None,
        "Selected_Clip_2_Media_Asset_ID": clips[1]["media_asset_record_id"] if len(clips) > 1 else None,
        "Selected_Clip_3_Media_Asset_ID": clips[2]["media_asset_record_id"] if len(clips) > 2 else None,
        "Selected_Clip_Count": package.get("clip_count") or 0,
        "Selected_Assets_JSON": package.get("selected_assets_json"),
        "Render_Clip_List_JSON": package.get("render_clip_list_json"),
        "Render_Total_Frames": package.get("total_frames") or 0,
        "Clip_1_Duration_Frames": int(clips[0].get("durationFrames") or per or 0) if clips else 0,
        "Clip_2_Duration_Frames": int(clips[1].get("durationFrames") or per or 0) if len(clips) > 1 else 0,
        "Clip_3_Duration_Frames": int(clips[2].get("durationFrames") or per or 0) if len(clips) > 2 else 0,
        "Voiceover_URL": field_str(parent or {}, "Voiceover_URL") or None if (
            directive_yes(package.get("effective", {}).get("voiceover_mode")) and not package.get("story")
        ) else None,
        "Music_URL": package.get("effective", {}).get("music_url") or None,
        "Preferred_Music_URL": package.get("effective", {}).get("music_url") or None,
        # Keep background music below narration. This is 60% of the prior 1.0 mix.
        "Music_Volume": 0.6 if package.get("effective", {}).get("music_url") else 0,
        "Music_Start_Seconds": package.get("effective", {}).get("music_start_seconds") or 0,
        "Timing_Status": (
            "Pending"
            if (not native and _music_requested(package.get("effective") or {}))
            else ("Skipped" if not native else None)
        ),
        "Voiceover_Duration_Seconds": package.get("effective", {}).get("voiceover_duration_seconds") or None,
    }
    authoritative = bool(package.get("timed_script"))
    if authoritative:
        # Beat sync must not rewrite imported scene lengths. Music can still play.
        fields["Timing_Status"] = "Skipped"
        fields["Timing_Timeline_JSON"] = None
        fields["Timing_Error_Message"] = None
    existing_record = existing if isinstance(existing, dict) and "fields" in existing else {"fields": existing or {}}
    existing_timing = field_str(existing_record, "Timing_Status")
    existing_timeline = field_str(existing_record, "Timing_Timeline_JSON")
    old_stills = _clip_still_urls(field(existing_record, "Render_Clip_List_JSON"))
    new_stills = _clip_still_urls(package.get("render_clip_list_json"))
    old_overlays = _clip_overlay_texts(field(existing_record, "Render_Clip_List_JSON"))
    new_overlays = _clip_overlay_texts(package.get("render_clip_list_json"))
    old_render = _clip_render_signature(field(existing_record, "Render_Clip_List_JSON"))
    new_render = _clip_render_signature(package.get("render_clip_list_json"))
    recropped = bool(new_stills) and bool(old_stills) and new_stills != old_stills
    overlay_changed = bool(new_overlays) and new_overlays != old_overlays
    render_changed = bool(new_render) and new_render != old_render
    if authoritative:
        pass
    elif recropped or render_changed:
        fields["Timing_Status"] = "Pending" if _music_requested(package.get("effective") or {}) else "Skipped"
        fields["Timing_Timeline_JSON"] = None
        fields["Timing_Error_Message"] = None
    elif existing_timing in {"Ready", "Skipped"} or existing_timeline:
        if not overlay_changed:
            fields.pop("Render_Clip_List_JSON", None)
            fields.pop("Render_Total_Frames", None)
        if existing_timing in {"Ready", "Skipped"}:
            fields.pop("Timing_Status", None)
        elif existing_timeline:
            fields["Timing_Status"] = "Ready"
    if is_designed_cover_url(thumb):
        fields["Thumbnail_URL"] = thumb
    first_url = clips[0]["url"] if clips else None
    from ap0.public_mp4 import is_public_publish_url
    public = first_url if is_public_publish_url(str(first_url or "")) else None
    if package.get("finished"):
        video = package.get("finished_kind") == "finished-video"
        fields.update({
            "Output_Status": "Ready for Review",
            "Render_Status": "Rendered" if video else "Native Photo Route",
            "Asset_Selection_Status": None,
            "Studio_Preview_URL": first_url,
            "Final_File_URL": first_url if video else None,
            "Publish_Asset_URL": public,
            "Composition_ID": None,
            "Output_Filename": None,
            "Review_Status": None,
        })
        return fields
    if package.get("story_teaser"):
        fields.update({
            "Output_Status": "In Production",
            "Render_Status": "Ready for Render",
            "Asset_Selection_Status": "Selected",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Output_Filename": package.get("output_filename"),
            "Render_Total_Frames": package.get("total_frames"),
            "Timing_Status": "Skipped",
            "Music_URL": None,
            "Preferred_Music_URL": None,
            "Music_Volume": 0,
            "Final_File_URL": None,
            "Final_File_ID": None,
            "Studio_Preview_URL": None,
            "Publish_Asset_URL": None,
            "Review_Status": None,
            "Review_Email_Sent_At": None,
        })
        return fields
    if native:
        fields.update({
            "Output_Status": "Ready for Review",
            "Render_Status": "Native Photo Route",
            "Asset_Selection_Status": None,
            "Studio_Preview_URL": clips[0]["url"] if clips else None,
            "Composition_ID": None,
            "Output_Filename": None,
        })
    else:
        fields.update({
            "Output_Status": "In Production",
            "Render_Status": "Ready for Render",
            "Asset_Selection_Status": "Selected",
            "Composition_ID": "ChicagoShiningPhotoSequence",
            "Output_Filename": package.get("output_filename"),
            "Review_Status": None,
            "Review_Email_Sent_At": None,
            "Studio_Preview_URL": None,
        })
    return fields


def stamp_outputs(
    client: AirtableClient,
    request: dict[str, Any],
    outputs: list[dict[str, Any]],
    parent: dict[str, Any] | None,
) -> dict[str, Any]:
    ensure_catalog_music(client, request, parent, outputs)
    stamped = 0
    missing = []
    for output in outputs:
        status = field_str(output, "Output_Status")
        if status in {"Ready for Review", "Approved for Publishing", "Published"} and (
            field_str(output, "Final_File_URL") or field_str(output, "Studio_Preview_URL") or field_str(output, "Render_Status") == "Native Photo Route"
        ):
            stamped += 1
            continue
        package = source_package(request, output, parent)
        if not package:
            missing.append(output["id"])
            continue
        client.update_record(PLATFORM_OUTPUTS_TABLE, output["id"], stamp_fields(package, parent, existing=output), typecast=True)
        stamped += 1
    return {"stamped": stamped, "missing": missing, "total": len(outputs)}
