from __future__ import annotations

from typing import Any

from studio_produce.media import distribute_frames, source_duration_seconds

MAX_SLICES = 60
NO_MUSIC_MIN_CLIP_SECONDS = 2.0
FPS_DEFAULT = 30


def is_video_clip(clip: dict[str, Any] | None) -> bool:
    item = clip or {}
    kind = str(item.get("media_kind") or item.get("mediaKind") or "").strip().lower()
    if kind == "video":
        return True
    if kind in {"photo", "image"}:
        return False
    name = str(item.get("assetName") or item.get("asset_name") or item.get("url") or "").lower()
    return name.endswith((".mp4", ".mov", ".m4v", ".webm"))


def clips_have_video(clips: list[dict[str, Any]]) -> bool:
    return any(is_video_clip(clip) for clip in clips)


def _merge_span_seconds(ranges: list[tuple[float, float]]) -> float:
    """Sum seconds covered by ranges after merging overlaps."""
    cleaned = sorted(
        (float(start), float(end))
        for start, end in ranges
        if end > start + 1e-9
    )
    if not cleaned:
        return 0.0
    total = 0.0
    cur_start, cur_end = cleaned[0]
    for start, end in cleaned[1:]:
        if start <= cur_end + 1e-9:
            cur_end = max(cur_end, end)
            continue
        total += max(0.0, cur_end - cur_start)
        cur_start, cur_end = start, end
    total += max(0.0, cur_end - cur_start)
    return float(total)


def unique_video_usable_seconds(clips: list[dict[str, Any]], *, fps: int = FPS_DEFAULT) -> float:
    """Sum unique video source spans.

    Duplicate rows of the same file count overlapping windows once, but distinct
    trims of one long master (Vibe Cut) must add together — otherwise T1 caps the
    whole montage to the longest single trim (~1s) and Remotion gets a 28×0.1s cut.
    """
    spans: dict[str, list[tuple[float, float]]] = {}
    for index, clip in enumerate(clips):
        if not is_video_clip(clip):
            continue
        key = source_key(clip) or f"video:{index}"
        start, end = _source_span(clip, fps)
        if end <= start:
            continue
        spans.setdefault(key, []).append((start, end))
    return float(sum(_merge_span_seconds(ranges) for ranges in spans.values()))


def photo_floor_seconds(clips: list[dict[str, Any]], *, fps: int = FPS_DEFAULT) -> float:
    total = 0.0
    for clip in clips:
        if is_video_clip(clip):
            continue
        frames = int(clip.get("durationFrames") or clip.get("duration_frames") or 0)
        if frames > 0:
            total += frames / max(1, fps)
    return float(total)


def footage_usable_seconds(clips: list[dict[str, Any]], *, fps: int = FPS_DEFAULT) -> float:
    return unique_video_usable_seconds(clips, fps=fps) + photo_floor_seconds(clips, fps=fps)


def source_key(clip: dict[str, Any]) -> str:
    return str(
        clip.get("googleDriveFileId")
        or clip.get("google_drive_file_id")
        or clip.get("url")
        or clip.get("src")
        or clip.get("id")
        or ""
    )


def photo_slot_indexes(slot_count: int, photo_count: int) -> list[int]:
    if photo_count <= 0 or slot_count <= 0:
        return []
    if photo_count >= slot_count:
        return list(range(slot_count))
    if photo_count == 1:
        return [slot_count // 2]
    raw = [round(index * (slot_count - 1) / (photo_count - 1)) for index in range(photo_count)]
    used: set[int] = set()
    result: list[int] = []
    for value in raw:
        index = max(0, min(slot_count - 1, int(value)))
        while index in used and index < slot_count - 1:
            index += 1
        while index in used and index > 0:
            index -= 1
        used.add(index)
        result.append(index)
    return result


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _source_span(clip: dict[str, Any], fps: int) -> tuple[float, float]:
    duration = source_duration_seconds(clip)
    frames = int(clip.get("durationFrames") or clip.get("duration_frames") or 0)
    if duration <= 0 and frames:
        duration = frames / max(1, fps)
    source_in = _as_float(clip.get("sourceInSeconds") or clip.get("source_in_seconds") or 0)
    source_out = _as_float(clip.get("sourceOutSeconds") or clip.get("source_out_seconds") or 0)
    if source_out > source_in:
        return source_in, source_out
    return 0.0, max(0.2, duration)


def _overlaps(used: list[tuple[float, float]], start: float, end: float) -> bool:
    for left, right in used:
        if start < right and end > left:
            return True
    return False


def pick_in_point(
    clip: dict[str, Any],
    slot_seconds: float,
    used: dict[str, list[tuple[float, float]]],
    scene_times: dict[str, list[float]] | None = None,
    *,
    wrap: bool = False,
) -> float:
    key = source_key(clip)
    start, end = _source_span(clip, FPS_DEFAULT)
    window = max(0.2, float(slot_seconds))
    if end - start < window:
        return start
    taken = list(used.get(key) or [])
    scenes = [float(time) for time in (scene_times or {}).get(key, []) if isinstance(time, (int, float))]
    candidates: list[float] = []
    for time in scenes:
        if start <= time and time + window <= end:
            candidates.append(time)
    cursor = start
    while cursor + window <= end + 0.0001:
        candidates.append(round(cursor, 4))
        cursor += window
    for time in candidates:
        if not _overlaps(taken, time, time + window):
            used.setdefault(key, []).append((time, time + window))
            return time
    if wrap:
        used[key] = [(start, start + window)]
        return start
    return None


def _merge_transition(existing: Any, planned: Any) -> dict[str, Any] | None:
    existing = existing if isinstance(existing, dict) else {}
    planned = planned if isinstance(planned, dict) else {}
    if not existing and not planned:
        return None
    merged = dict(planned)
    if existing.get("type"):
        merged["type"] = existing["type"]
    if not (merged.get("durationFrames") or merged.get("duration_frames")) and (
        existing.get("durationFrames") or existing.get("duration_frames")
    ):
        merged["duration_frames"] = existing.get("durationFrames") or existing.get("duration_frames")
    if merged.get("duration_frames") and "durationFrames" not in merged:
        merged["durationFrames"] = merged["duration_frames"]
    elif merged.get("durationFrames") and "duration_frames" not in merged:
        merged["duration_frames"] = merged["durationFrames"]
    return merged or None


def _copy_source(source: dict[str, Any], *, in_seconds: float, frames: int, fps: int) -> dict[str, Any]:
    item = dict(source)
    out_seconds = in_seconds + (frames / max(1, fps))
    video = is_video_clip(source)
    item["durationFrames"] = max(1, frames)
    item["inSeconds"] = in_seconds if video else 0
    item["in_seconds"] = in_seconds if video else 0
    item["outSeconds"] = out_seconds if video else None
    item["out_seconds"] = out_seconds if video else source.get("out_seconds")
    item["startFromSeconds"] = in_seconds if video else 0
    duration = source_duration_seconds(source)
    if video:
        item["sourceDurationSeconds"] = duration
        item["source_duration_seconds"] = duration
    return item


def expand_to_timeline(
    sources: list[dict[str, Any]],
    timeline: dict[str, Any],
    *,
    scene_times: dict[str, list[float]] | None = None,
    fps: int = FPS_DEFAULT,
    allow_video_wrap: bool = False,
) -> list[dict[str, Any]]:
    plan = timeline.get("timeline") or timeline
    plan_clips = [item for item in (plan.get("clips") or []) if isinstance(item, dict)]
    if not sources or not plan_clips:
        return list(sources)
    fps_i = max(1, int(plan.get("fps") or timeline.get("fps") or fps or FPS_DEFAULT))
    photos = [clip for clip in sources if not is_video_clip(clip)]
    videos = [clip for clip in sources if is_video_clip(clip)]
    used: dict[str, list[tuple[float, float]]] = {}
    start = 0
    updated: list[dict[str, Any]] = []

    def _clamp_video_frames(source: dict[str, Any], in_seconds: float, frames: int) -> int:
        _source_start, source_end = _source_span(source, fps_i)
        remaining = max(0.0, source_end - max(0.0, in_seconds))
        max_frames = max(1, int(remaining * fps_i + 1e-6))
        return max(1, min(frames, max_frames))

    if len(plan_clips) <= len(sources) and (not videos or len(plan_clips) == len(sources)):
        for index, source in enumerate(sources):
            plan_clip = plan_clips[index] if index < len(plan_clips) else {}
            frames = max(1, int(plan_clip.get("duration_frames") or source.get("durationFrames") or 1))
            if is_video_clip(source):
                in_seconds = pick_in_point(source, frames / fps_i, used, scene_times, wrap=False)
                if in_seconds is None:
                    in_seconds = _source_span(source, fps_i)[0]
                frames = _clamp_video_frames(source, in_seconds, frames)
            else:
                in_seconds = 0.0
            item = _copy_source(source, in_seconds=in_seconds, frames=frames, fps=fps_i)
            item["startFrame"] = start
            transition = _merge_transition(source.get("transition"), plan_clip.get("transition"))
            if transition:
                item["transition"] = transition
            start += item["durationFrames"]
            updated.append(item)
        return updated

    photo_slots = set(photo_slot_indexes(len(plan_clips), len(photos)))
    photo_iter = iter(photos)
    video_rr = 0
    for index, plan_clip in enumerate(plan_clips[:MAX_SLICES]):
        frames = max(1, int(plan_clip.get("duration_frames") or 1))
        slot_seconds = frames / fps_i
        source: dict[str, Any] | None = None
        in_seconds = 0.0
        if index in photo_slots:
            source = next(photo_iter, None)
            if source is None and videos:
                placed = False
                for _ in range(len(videos)):
                    candidate = videos[video_rr % len(videos)]
                    video_rr += 1
                    picked = pick_in_point(
                        candidate, slot_seconds, used, scene_times, wrap=allow_video_wrap
                    )
                    if picked is None:
                        continue
                    source = candidate
                    in_seconds = picked
                    frames = _clamp_video_frames(source, in_seconds, frames)
                    placed = True
                    break
                if not placed:
                    break
            else:
                source = source or (photos[0] if photos else None)
                if source is None:
                    break
                in_seconds = 0.0
        elif videos:
            placed = False
            for _ in range(len(videos)):
                candidate = videos[video_rr % len(videos)]
                video_rr += 1
                picked = pick_in_point(
                    candidate, slot_seconds, used, scene_times, wrap=allow_video_wrap
                )
                if picked is None:
                    continue
                source = candidate
                in_seconds = picked
                frames = _clamp_video_frames(source, in_seconds, frames)
                placed = True
                break
            if not placed:
                break
        else:
            source = photos[index % len(photos)] if photos else sources[index % len(sources)]
            in_seconds = 0.0
        assert source is not None
        item = _copy_source(source, in_seconds=in_seconds, frames=frames, fps=fps_i)
        item["id"] = f"{source.get('id') or 'studio-source'}-slice-{index + 1}"
        item["order"] = index + 1
        item["startFrame"] = start
        transition = _merge_transition(source.get("transition"), plan_clip.get("transition"))
        if transition:
            item["transition"] = transition
        start += item["durationFrames"]
        updated.append(item)
    return updated


def expand_without_beats(
    clips: list[dict[str, Any]],
    *,
    target_frames: int,
    fps: int = FPS_DEFAULT,
    min_clip_seconds: float = NO_MUSIC_MIN_CLIP_SECONDS,
    scene_times: dict[str, list[float]] | None = None,
) -> list[dict[str, Any]]:
    photos = [clip for clip in clips if not is_video_clip(clip)]
    videos = [clip for clip in clips if is_video_clip(clip)]
    if len(videos) != 1 or not photos:
        return list(clips)
    photo_frames = [max(1, int(clip.get("durationFrames") or 1)) for clip in photos]
    photo_total = sum(photo_frames)
    video_budget = max(1, int(target_frames) - photo_total)
    min_frames = max(1, round(float(min_clip_seconds) * fps))
    max_video_slots = max(1, MAX_SLICES - len(photos))
    video_slots = max(1, min(max_video_slots, max(1, video_budget // min_frames)))
    video_frames = distribute_frames([1] * video_slots, video_budget)
    slot_count = video_slots + len(photos)
    photo_slots = set(photo_slot_indexes(slot_count, len(photos)))
    plan_clips: list[dict[str, Any]] = []
    photo_i = 0
    video_i = 0
    start = 0
    for index in range(slot_count):
        if index in photo_slots and photo_i < len(photo_frames):
            frames = photo_frames[photo_i]
            photo_i += 1
        else:
            frames = video_frames[min(video_i, len(video_frames) - 1)]
            video_i += 1
        plan_clips.append({"duration_frames": frames, "start_frame": start})
        start += frames
    delta = int(target_frames) - sum(item["duration_frames"] for item in plan_clips)
    if delta and plan_clips:
        plan_clips[-1]["duration_frames"] = max(1, plan_clips[-1]["duration_frames"] + delta)
    return expand_to_timeline(
        clips,
        {"timeline": {"fps": fps, "duration_frames": target_frames, "clips": plan_clips}},
        scene_times=scene_times,
        fps=fps,
    )
