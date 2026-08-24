"""Deterministic P4 clip-target and coverage validation (Make modules 7/37)."""

from __future__ import annotations

from typing import Any

from render.fields import field, field_str


def _int(value: Any, default: int | None = None) -> int | None:
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def clip_count_mode(output: dict[str, Any]) -> str:
    return field_str(output, "Requested_Video_Clip_Count_Mode") or "AI decides"


def video_target_valid(output: dict[str, Any]) -> bool:
    mode = clip_count_mode(output)
    if mode == "Exact":
        exact = _int(field(output, "Requested_Video_Clip_Count_Exact"))
        return exact is not None and 1 <= exact <= 15
    if mode == "Target range":
        minimum = _int(field(output, "Requested_Video_Clip_Count_Min"))
        maximum = _int(field(output, "Requested_Video_Clip_Count_Max"))
        return (
            minimum is not None
            and maximum is not None
            and 1 <= minimum <= 15
            and maximum <= 15
            and minimum <= maximum
        )
    return True


def effective_video_target(
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    production_profile: dict[str, Any] | None,
) -> int:
    mode = clip_count_mode(output)
    if mode == "Exact":
        return int(field(output, "Requested_Video_Clip_Count_Exact") or 0)
    if mode == "Target range":
        return int(field(output, "Requested_Video_Clip_Count_Min") or 0)
    content_count = _int(field(content_item or {}, "Video_Clip_Count"))
    if content_count:
        return content_count
    return int(field(production_profile or {}, "Default_Video_Clip_Count") or 0)


def approved_duration(
    content_item: dict[str, Any] | None,
    production_profile: dict[str, Any] | None,
) -> int:
    duration = _int(field(content_item or {}, "Content_Duration"))
    if duration is not None:
        return duration
    return int(field(production_profile or {}, "Default_Duration") or 0)


def carousel_slide_target(
    content_item: dict[str, Any] | None,
    production_profile: dict[str, Any] | None,
) -> int:
    slides = _int(field(content_item or {}, "Carousel_Slide_Count"))
    if slides is not None:
        return slides
    return int(field(production_profile or {}, "Default_Carousel_Slide_Count") or 0)


def is_carousel(content_item: dict[str, Any] | None) -> bool:
    return field_str(content_item or {}, "Content_Type") == "Carousel"


def deterministic_existing_count(candidate_count: int, target: int) -> int:
    if candidate_count <= 0 or target <= 0:
        return 0
    return min(candidate_count, target)


def deterministic_missing_count(target: int, existing: int) -> int:
    return max(target - existing, 0)


def _shot_list(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    shots = parsed.get("shot_list") or []
    return shots if isinstance(shots, list) else []


def _sum_shot(parsed: dict[str, Any], key: str) -> float:
    total = 0.0
    for shot in _shot_list(parsed):
        if not isinstance(shot, dict):
            continue
        total += float(shot.get(key) or 0)
    return total


def validate_coverage(
    parsed: dict[str, Any],
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    production_profile: dict[str, Any] | None,
) -> str:
    shots = _shot_list(parsed)
    covered = int(parsed.get("existing_covered_visual_count") or 0)
    matching = parsed.get("existing_matching_asset_ids") or []
    if not isinstance(matching, list):
        matching = []
    distinct_matching = len({str(item) for item in matching if item})
    missing_count = int(parsed.get("missing_asset_count") or 0)
    needed = bool(parsed.get("asset_request_needed"))
    covered_seconds = float(parsed.get("existing_covered_final_length_seconds") or 0)
    desired_seconds = _sum_shot(parsed, "desired_final_length_seconds")
    raw_seconds = _sum_shot(parsed, "recommended_raw_capture_seconds")

    if is_carousel(content_item):
        target = carousel_slide_target(content_item, production_profile)
        core = (
            covered + len(shots) == target
            and distinct_matching == covered
            and covered_seconds == 0
            and desired_seconds == 0
            and raw_seconds == 0
        )
    else:
        if not video_target_valid(output):
            return "FAIL"
        target = effective_video_target(output, content_item, production_profile)
        duration = approved_duration(content_item, production_profile)
        core = (
            covered + len(shots) == target
            and distinct_matching == covered
            and (covered_seconds + desired_seconds) >= duration
        )

    if not core:
        return "FAIL"
    if missing_count != len(shots):
        return "FAIL"
    if len(shots) > 0:
        return "PASS" if needed else "FAIL"
    return "PASS" if not needed else "FAIL"
