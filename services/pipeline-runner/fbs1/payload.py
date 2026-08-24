from __future__ import annotations

from typing import Any

from asset.helpers import parse_int
from fbs1.constants import (
    CLIP_DURATION_FRAMES,
    COMPOSITION_ID,
    DEFAULT_BRAND,
    DEFAULT_MUSIC_VOLUME,
    END_HOLD_FRAMES,
    FPS,
    HEIGHT,
    TITLE_DURATION_FRACTION,
    TRANSITION_FRAMES,
    WIDTH,
)
from fbs1.slides import slide_clip
from render.fields import field, field_str


def build_render_payload(output: dict[str, Any], slides: list[dict[str, Any]]) -> dict[str, Any]:
    clips = [{k: v for k, v in slide_clip(slide).items() if k != "revision"} for slide in slides]
    count = len(clips)
    output_id = field_str(output, "Output_ID") or output.get("id") or "unknown"
    music_url = field_str(output, "Selected_Music_URL") or field_str(output, "Music_URL")
    music_volume = field(output, "Music_Volume")
    try:
        volume = float(music_volume) if music_volume not in (None, "") else DEFAULT_MUSIC_VOLUME
    except (TypeError, ValueError):
        volume = DEFAULT_MUSIC_VOLUME
    return {
        "filename": f"facebook-slideshow-output-{output_id}.mp4",
        "compositionId": COMPOSITION_ID,
        "titleText": field_str(output, "Title_Text") or field_str(output, "Output_Title"),
        "brandText": field_str(output, "Brand_Text") or DEFAULT_BRAND,
        "titleDurationFraction": TITLE_DURATION_FRACTION,
        "coverUrl": field_str(output, "Thumbnail_URL"),
        "fps": FPS,
        "width": WIDTH,
        "height": HEIGHT,
        "durationInFrames": count * CLIP_DURATION_FRAMES + END_HOLD_FRAMES,
        "durationSeconds": count * 3 + 1,
        "transitionFrames": TRANSITION_FRAMES,
        "endHoldFrames": END_HOLD_FRAMES,
        "music": {"url": music_url, "volume": volume},
        "voiceover": {"url": field_str(output, "Voiceover_URL"), "volume": 1},
        "clips": clips,
    }


def expected_image_count(output: dict[str, Any]) -> int | None:
    return parse_int(field(output, "Image_Count"))
