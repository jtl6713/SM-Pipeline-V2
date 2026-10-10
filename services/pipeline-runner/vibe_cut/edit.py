"""Build music-montage clip plans for Vibe Cut produce.

Mirrors apps/studio-api/vibe-cut.mjs provisional selects + buildVibeCutEdit so
stamp can emit many source trims instead of one head-of-file clip. Beats from
Timing Engine can refine durations later; this guarantees cut variety even when
T1 still sees a single master asset.
"""

from __future__ import annotations

import hashlib
import math
from typing import Any

STYLE_BASE = {
    "smooth-vibes": {
        "min_clip": 2.4,
        "max_clip": 4.2,
        "preferred_clip": 3.4,
        "pacing": "slow",
        "preset": "cinematic",
        "default_energy": 2,
    },
    "beat-cut": {
        "min_clip": 0.7,
        "max_clip": 2.4,
        "preferred_clip": 1.4,
        "pacing": "fast",
        "preset": "energetic",
        "default_energy": 3,
    },
    "fast-cuts": {
        "min_clip": 0.45,
        "max_clip": 1.6,
        "preferred_clip": 0.85,
        "pacing": "fast",
        "preset": "energetic",
        "default_energy": 4,
    },
}


def _clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def normalize_style(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-")
    if text in STYLE_BASE:
        return text
    if "smooth" in text:
        return "smooth-vibes"
    if "fast" in text:
        return "fast-cuts"
    return "beat-cut"


def normalize_energy(value: Any, style: str = "beat-cut") -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        n = int(STYLE_BASE.get(style, STYLE_BASE["beat-cut"])["default_energy"])
    return max(1, min(5, n))


def normalize_target_seconds(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = 30.0
    if not math.isfinite(n):
        n = 30.0
    return _clamp(n, 8.0, 90.0)


def style_params(style: Any, energy: Any) -> dict[str, Any]:
    normalized = normalize_style(style)
    base = STYLE_BASE[normalized]
    e = normalize_energy(energy, normalized)
    t = (e - 1) / 4.0
    shorten = 1 - t * 0.45
    lengthen = 1 + (1 - t) * 0.15
    return {
        "style": normalized,
        "energy": e,
        "min_clip": max(0.35, round(base["min_clip"] * shorten, 3)),
        "max_clip": max(0.6, round(base["max_clip"] * (shorten if t > 0.5 else lengthen), 3)),
        "preferred_clip": max(0.4, round(base["preferred_clip"] * shorten, 3)),
        "pacing": base["pacing"],
        "preset": base["preset"],
    }


def default_config(partial: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = dict(partial or {})
    style = normalize_style(raw.get("style") or raw.get("editing_style"))
    energy_raw = raw.get("energy")
    if energy_raw is None:
        energy_raw = raw.get("energy_level")
    energy = normalize_energy(energy_raw, style)
    target_raw = raw.get("target_seconds")
    if target_raw is None:
        target_raw = raw.get("targetSeconds")
    chronology = str(raw.get("chronology") or raw.get("order") or "best-moments").strip().lower()
    if chronology not in {"best-moments", "chronological"}:
        chronology = "best-moments"
    beat = str(raw.get("beat_sync") or raw.get("beatSync") or "on").strip().lower()
    params = style_params(style, energy)
    return {
        "schema_version": "vibe-cut.1",
        "mode": "vibe_cut",
        "style": style,
        "energy": energy,
        "target_seconds": normalize_target_seconds(30 if target_raw is None else target_raw),
        "chronology": chronology,
        "beat_sync": "off" if beat == "off" else "on",
        "versions": 1,
        "prefer_unused": bool(raw.get("prefer_unused") or raw.get("preferUnused")),
        "find_best": bool(raw.get("find_best") or raw.get("findBest")),
        "aspect_ratio": str(raw.get("aspect_ratio") or raw.get("aspectRatio") or "9:16").strip() or "9:16",
        "voiceover": "off",
        "params": params,
    }


def provisional_selects_from_duration(
    duration_seconds: float,
    *,
    count: int = 16,
    window_seconds: float = 2.5,
) -> list[dict[str, Any]]:
    duration = max(1.0, float(duration_seconds or 0))
    n = min(40, max(6, int(round(count or 16))))
    window = min(4.0, max(1.0, float(window_seconds or 2.5)))
    selects: list[dict[str, Any]] = []
    for i in range(n):
        center = ((i + 0.5) / n) * duration
        start = _clamp(center - window / 2, 0.0, max(0.0, duration - 0.4))
        end = _clamp(start + window, start + 0.4, duration)
        selects.append(
            {
                "id": f"provisional-{i + 1}",
                "start_seconds": round(start, 3),
                "end_seconds": round(end, 3),
                "duration_seconds": round(end - start, 3),
                "peak_seconds": round(center, 3),
                "score": 0.45 + ((i % 5) * 0.04),
                "motion_score": 0.3 + ((i % 3) * 0.15),
                "composition_score": 0.5,
                "provisional": True,
            }
        )
    return selects


def _mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def _rand() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (61 | t))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return _rand


def _hash_seed(parts: list[Any]) -> int:
    raw = "|".join(str(part) for part in parts).encode("utf-8")
    return int(hashlib.sha1(raw).hexdigest()[:8], 16)


def build_vibe_cut_edit(
    *,
    selects: list[dict[str, Any]],
    config: dict[str, Any] | None = None,
    beats: list[float] | None = None,
    version_index: int = 0,
) -> dict[str, Any]:
    normalized = default_config(config)
    params = style_params(normalized["style"], normalized["energy"])
    ranked = sorted(
        [row for row in (selects or []) if isinstance(row, dict)],
        key=lambda row: (
            -float(row.get("score") or 0),
            float(row.get("start_seconds") or 0),
        ),
    )
    if normalized["chronology"] == "chronological":
        ranked = sorted(ranked, key=lambda row: float(row.get("start_seconds") or 0))
    rng = _mulberry32(
        _hash_seed(
            [
                normalized["style"],
                normalized["energy"],
                normalized["target_seconds"],
                version_index,
                ",".join(str(row.get("id") or "") for row in ranked),
            ]
        )
    )
    beats_in = sorted(
        float(b) for b in (beats or []) if isinstance(b, (int, float)) and float(b) >= 0
    )
    median_gap = params["preferred_clip"]
    if len(beats_in) >= 2:
        gaps = sorted(beats_in[i] - beats_in[i - 1] for i in range(1, len(beats_in)))
        median_gap = gaps[len(gaps) // 2] or median_gap

    hero = ranked[0] if ranked else None
    pool = list(ranked)
    clips: list[dict[str, Any]] = []
    consumed: list[dict[str, float]] = []
    cursor = 0.0
    hero_placed = False
    target = float(normalized["target_seconds"])

    source_span = 0.0
    for row in ranked:
        try:
            source_span = max(source_span, float(row.get("end_seconds") or 0))
        except (TypeError, ValueError):
            continue
    if source_span <= 0:
        source_span = max(target * 1.5, 20.0)

    def _append_clip(source_start: float, duration: float, select: dict[str, Any] | None = None) -> None:
        nonlocal cursor
        source_end = source_start + duration
        clips.append(
            {
                "index": len(clips) + 1,
                "select_id": (select or {}).get("id"),
                "timeline_start_seconds": round(cursor, 3),
                "timeline_end_seconds": round(cursor + duration, 3),
                "duration_seconds": round(duration, 3),
                "source_start_seconds": round(source_start, 3),
                "source_end_seconds": round(source_end, 3),
                "score": (select or {}).get("score"),
                "motion_score": (select or {}).get("motion_score"),
                "transition": "cut",
                "beat_sync": normalized["beat_sync"] != "off",
            }
        )
        consumed.append(
            {
                "start_seconds": round(source_start, 3),
                "end_seconds": round(source_end, 3),
            }
        )
        cursor += duration

    while cursor < target - 0.35 and pool:
        remaining = target - cursor
        pick_index = 0
        if (
            not hero_placed
            and hero
            and cursor + params["preferred_clip"] >= target * 0.55 - 0.4
        ):
            try:
                pick_index = next(i for i, row in enumerate(pool) if row.get("id") == hero.get("id"))
            except StopIteration:
                pick_index = 0
        elif normalized["chronology"] == "best-moments":
            pick_index = int(rng() * min(4, len(pool)))

        select = pool.pop(pick_index)
        if select.get("id") == (hero or {}).get("id"):
            hero_placed = True

        select_dur = float(select.get("duration_seconds") or 0) or max(
            0.4,
            float(select.get("end_seconds") or 0) - float(select.get("start_seconds") or 0),
        )
        duration = _clamp(
            min(params["preferred_clip"], max(params["min_clip"], median_gap)),
            params["min_clip"],
            params["max_clip"],
        )
        duration = min(duration, remaining, select_dur)
        if duration < min(0.4, params["min_clip"]):
            break

        start_seconds = float(select.get("start_seconds") or 0)
        end_seconds = float(select.get("end_seconds") or (start_seconds + select_dur))
        peak = select.get("peak_seconds")
        try:
            peak_f = float(peak)
        except (TypeError, ValueError):
            peak_f = float("nan")
        if math.isfinite(peak_f) and select_dur > duration:
            source_start = _clamp(peak_f - duration / 2, start_seconds, end_seconds - duration)
        elif select_dur > duration:
            source_start = start_seconds + (select_dur - duration) * 0.2
        else:
            source_start = start_seconds
        _append_clip(source_start, duration, select)

    # Keep cutting from unused source ranges until the owner target is filled.
    # Without this, a short provisional select pool ends the montage early
    # (e.g. 16 selects → ~17s instead of the requested 30s).
    guard = 0
    while cursor < target - 0.35 and guard < 40:
        guard += 1
        remaining = target - cursor
        duration = min(
            remaining,
            _clamp(params["preferred_clip"], params["min_clip"], params["max_clip"]),
        )
        if duration < 0.4:
            break
        # Prefer a later unused stretch of the source.
        used_end = max((float(row["end_seconds"]) for row in consumed), default=0.0)
        source_start = used_end if used_end + duration <= source_span else _clamp(
            (guard * 1.7) % max(0.4, source_span - duration),
            0.0,
            max(0.0, source_span - duration),
        )
        if source_start + duration > source_span + 1e-6:
            break
        _append_clip(source_start, duration, None)

    duration_seconds = clips[-1]["timeline_end_seconds"] if clips else 0.0
    return {
        "schema_version": "vibe-cut.1",
        "mode": "vibe_cut",
        "version_index": version_index,
        "style": normalized["style"],
        "energy": normalized["energy"],
        "chronology": normalized["chronology"],
        "beat_sync": normalized["beat_sync"],
        "target_seconds": target,
        "duration_seconds": round(float(duration_seconds), 3),
        "clip_count": len(clips),
        "clips": clips,
        "used_ranges": consumed,
        "params": params,
    }


def expand_master_to_vibe_sources(
    master: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    source_template: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Turn one long video master into many trim sources for stamp/T1."""
    normalized = default_config(config)
    try:
        duration = float(
            master.get("duration_seconds")
            or master.get("source_duration_seconds")
            or master.get("out_seconds")
            or 0
        )
    except (TypeError, ValueError):
        duration = 0.0
    if duration <= 1:
        duration = max(float(normalized["target_seconds"]) * 1.5, 20.0)

    preferred = float((normalized.get("params") or {}).get("preferred_clip") or 1.4)
    select_count = max(8, min(28, int(math.ceil(duration / max(0.6, preferred)) + 4)))
    selects = provisional_selects_from_duration(duration, count=select_count, window_seconds=max(1.2, preferred * 1.4))
    edit = build_vibe_cut_edit(selects=selects, config=normalized)
    clips = [row for row in (edit.get("clips") or []) if isinstance(row, dict)]
    if len(clips) < 2:
        # Hard fallback: even slice the source across the target window.
        slot = max(0.55, min(preferred, float(normalized["target_seconds"]) / 8))
        clips = []
        cursor = 0.0
        source_cursor = 0.0
        while cursor < float(normalized["target_seconds"]) - 0.3 and source_cursor < duration - 0.35:
            take = min(slot, float(normalized["target_seconds"]) - cursor, duration - source_cursor)
            if take < 0.4:
                break
            clips.append(
                {
                    "index": len(clips) + 1,
                    "timeline_start_seconds": round(cursor, 3),
                    "timeline_end_seconds": round(cursor + take, 3),
                    "duration_seconds": round(take, 3),
                    "source_start_seconds": round(source_cursor, 3),
                    "source_end_seconds": round(source_cursor + take, 3),
                    "beat_sync": True,
                    "transition": "cut",
                }
            )
            cursor += take
            # Jump ahead in source so later moments appear (best-moments bias).
            source_cursor = min(duration - 0.4, source_cursor + take + max(0.4, (duration - float(normalized["target_seconds"])) / max(4, len(clips) + 1)))

    template = dict(source_template or master or {})
    expanded: list[dict[str, Any]] = []
    for index, clip in enumerate(clips):
        start = float(clip.get("source_start_seconds") or 0)
        end = float(clip.get("source_end_seconds") or (start + float(clip.get("duration_seconds") or 0)))
        if end <= start + 0.2:
            continue
        item = {
            **template,
            **master,
            "id": f"{master.get('id') or 'vibe'}-cut-{index + 1}",
            "order": index + 1,
            "media_kind": "video",
            "in_seconds": round(start, 3),
            "out_seconds": round(end, 3),
            "inSeconds": round(start, 3),
            "outSeconds": round(end, 3),
            "startFromSeconds": round(start, 3),
            "source_in_seconds": round(start, 3),
            "source_out_seconds": round(end, 3),
            "sourceInSeconds": round(start, 3),
            "sourceOutSeconds": round(end, 3),
            "duration_seconds": round(duration, 3),
            "source_duration_seconds": round(duration, 3),
            "sourceDurationSeconds": round(duration, 3),
            "vibe_cut": True,
            "vibe_cut_index": index + 1,
            "caption": "" if index > 0 else str(master.get("caption") or template.get("caption") or ""),
        }
        # Keep authority ids on every slice.
        for key in (
            "media_asset_record_id",
            "google_drive_file_id",
            "google_drive_url",
            "preview_url",
            "preview_public_url",
            "url",
            "mime_type",
            "name",
            "variants",
        ):
            if master.get(key) is not None:
                item[key] = master.get(key)
            elif template.get(key) is not None:
                item[key] = template.get(key)
        expanded.append(item)
    return expanded or [dict(template or master or {})]


def desired_clip_count(config: dict[str, Any] | None, *, source_duration: float = 0) -> int:
    normalized = default_config(config)
    preferred = float((normalized.get("params") or {}).get("preferred_clip") or 1.4)
    target = float(normalized["target_seconds"])
    count = int(math.ceil(target / max(0.55, preferred)))
    if source_duration > target * 1.2:
        count = max(count, int(math.ceil(target / max(0.7, preferred))))
    return max(4, min(40, count))
