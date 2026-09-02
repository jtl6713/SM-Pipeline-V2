from __future__ import annotations

from typing import Any, Callable

DEFAULT_RULES: dict[str, Any] = {
    "strategy": "vo_phased",
    "recycle": False,
    "vo_clip_share": 0.35,
    "rules": [
        {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
        {"remaining": True, "every_n_beats": 1},
    ],
}

RuleHandler = Callable[[dict[str, Any], list[float], int, list[float], int], tuple[list[float], int]]


def _every_n_beats(
    rule: dict[str, Any],
    beats: list[float],
    needed: int,
    existing: list[float],
    last_index: int,
) -> tuple[list[float], int]:
    every_n = max(1, int(rule.get("every_n_beats") or 1))
    remaining = needed - len(existing)
    if remaining <= 0:
        return [], last_index
    if rule.get("remaining"):
        count = remaining
    else:
        count = min(remaining, max(0, int(rule.get("transition_count") or 0)))
    cuts: list[float] = []
    cursor = last_index
    for _ in range(count):
        cursor += every_n
        if cursor < len(beats):
            cuts.append(float(beats[cursor]))
        else:
            break
    return cuts, cursor if cuts else last_index


RULE_HANDLERS: dict[str, RuleHandler] = {
    "every_n_beats": _every_n_beats,
}


def _handler_for(rule: dict[str, Any]) -> RuleHandler:
    if "every_n_beats" in rule:
        return RULE_HANDLERS["every_n_beats"]
    raise ValueError(f"Unsupported timing rule: {rule!r}")


def _median_gap(beats: list[float]) -> float:
    if len(beats) < 2:
        return 0.5
    gaps = [beats[index] - beats[index - 1] for index in range(1, len(beats))]
    gaps.sort()
    mid = len(gaps) // 2
    if len(gaps) % 2:
        return max(0.05, gaps[mid])
    return max(0.05, (gaps[mid - 1] + gaps[mid]) / 2)


def _every_n_from(beats: list[float], every_n: int) -> list[float]:
    step = max(1, int(every_n))
    return [float(beats[index]) for index in range(step - 1, len(beats), step)]


def _nearest_unused(ideal: float, beats: list[float], taken: set[int], start: float, end: float) -> float | None:
    best_index = -1
    best_dist = float("inf")
    for index, time in enumerate(beats):
        if index in taken or time < start or time >= end:
            continue
        dist = abs(time - ideal)
        if dist < best_dist:
            best_dist = dist
            best_index = index
    if best_index < 0:
        return None
    taken.add(best_index)
    return float(beats[best_index])


def spread_then_snap(
    beats: list[float],
    count: int,
    start: float,
    end: float,
    *,
    min_clip_seconds: float,
) -> list[float]:
    needed = max(0, int(count))
    if needed <= 0 or end <= start:
        return []
    span = end - start
    ideals = [start + (span * (index + 1) / (needed + 1)) for index in range(needed)]
    window = [time for time in beats if start <= time < end]
    taken: set[int] = set()
    cuts: list[float] = []
    for ideal in ideals:
        snapped = _nearest_unused(ideal, window, taken, start, end)
        cuts.append(snapped if snapped is not None else ideal)
    return _enforce_spacing(cuts, start, end, min_clip_seconds, needed)


def _enforce_spacing(
    cuts: list[float],
    start: float,
    end: float,
    min_clip_seconds: float,
    needed: int,
) -> list[float]:
    if not cuts:
        return []
    ordered = sorted(float(cut) for cut in cuts)
    clamped: list[float] = []
    cursor = start
    for index, cut in enumerate(ordered[:needed]):
        left = needed - len(clamped)
        earliest = cursor + min_clip_seconds
        latest = end - (min_clip_seconds * left)
        value = min(max(cut, earliest), max(earliest, latest))
        clamped.append(round(value, 4))
        cursor = value
    return clamped


def _thin_beats(
    candidates: list[float],
    strengths: list[float],
    count: int,
    *,
    min_clip_seconds: float,
    duration: float,
    start: float,
) -> list[float]:
    needed = max(0, int(count))
    if needed <= 0 or not candidates:
        return []
    if needed >= len(candidates):
        return [float(time) for time in candidates[:needed]]
    weight = strengths if len(strengths) == len(candidates) else [1.0] * len(candidates)
    selected: list[float] = []
    remaining = list(range(len(candidates)))
    while len(selected) < needed and remaining:
        best_index = remaining[0]
        best_score = float("-inf")
        for index in remaining:
            time = candidates[index]
            strength = max(0.05, float(weight[index]))
            if selected:
                gap = min(abs(time - other) for other in selected)
                if gap < min_clip_seconds:
                    continue
            else:
                gap = min(time - start, duration - time)
            score = strength * (1.0 + (gap / max(duration, 0.25)))
            if score > best_score:
                best_score = score
                best_index = index
        if best_score == float("-inf"):
            break
        selected.append(float(candidates[best_index]))
        remaining.remove(best_index)
    return sorted(selected)


def _uses_phased(payload: dict[str, Any], rule_list: list[Any]) -> bool:
    if str(payload.get("strategy") or "").strip().lower() == "vo_phased":
        return True
    return any(
        isinstance(rule, dict) and ("until" in rule or rule.get("spread"))
        for rule in rule_list
    )


def _rule_every_n(rule_list: list[Any], *, remaining: bool, default: int) -> int:
    for rule in rule_list:
        if not isinstance(rule, dict):
            continue
        if remaining and (rule.get("remaining") or "until" not in rule):
            if "every_n_beats" in rule and ("until" not in rule or rule.get("remaining")):
                return max(1, int(rule.get("every_n_beats") or default))
        if not remaining and "until" in rule:
            return max(1, int(rule.get("every_n_beats") or default))
    return default


def _rule_spread(rule_list: list[Any]) -> bool:
    for rule in rule_list:
        if isinstance(rule, dict) and "until" in rule:
            return bool(rule.get("spread", True))
    return True


def _resolve_voiceover_end(
    voiceover_end_seconds: float | None,
    payload: dict[str, Any],
    duration: float,
) -> float | None:
    raw = voiceover_end_seconds
    if raw in (None, ""):
        raw = payload.get("voiceover_end_seconds")
    try:
        value = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if value <= 0 or value >= duration:
        return None
    return value


def _apply_legacy(
    beats: list[float],
    needed: int,
    duration: float,
    rule_list: list[Any],
    min_clip_seconds: float,
) -> tuple[list[float], dict[str, Any]]:
    cuts: list[float] = []
    log: list[dict[str, Any]] = []
    fallback = ""
    last_index = -1
    for rule in rule_list:
        added, last_index = _handler_for(rule)(rule, beats, needed, cuts, last_index)
        cuts.extend(added)
        log.append({"rule": rule, "added": added})
        if len(cuts) >= needed:
            break

    if len(cuts) < needed:
        fallback = "even_split_remainder"
        remaining = needed - len(cuts)
        start = cuts[-1] if cuts else 0.0
        span = duration - start
        for index in range(1, remaining + 1):
            cuts.append(start + (span * index / (remaining + 1)))

    clamped = _enforce_spacing(cuts, 0.0, duration, min_clip_seconds, needed)
    return clamped, {
        "rules_applied": log,
        "fallback": fallback,
        "beat_count": len(beats),
        "strategy": "legacy",
        "effective_clip_count": len(clamped) + 1,
        "recycle": False,
    }


def _apply_phased(
    beats: list[float],
    strengths: list[float],
    clip_count: int,
    duration: float,
    payload: dict[str, Any],
    rule_list: list[Any],
    min_clip_seconds: float,
    voiceover_end: float | None,
) -> tuple[list[float], dict[str, Any]]:
    recycle = bool(payload.get("recycle"))
    try:
        vo_share = min(0.8, max(0.15, float(payload.get("vo_clip_share") or 0.35)))
    except (TypeError, ValueError):
        vo_share = 0.35
    vo_every_n = _rule_every_n(rule_list, remaining=False, default=8)
    tail_every_n = _rule_every_n(rule_list, remaining=True, default=1)
    use_spread = _rule_spread(rule_list)
    needed = max(0, int(clip_count) - 1)
    fallback = ""
    log: list[dict[str, Any]] = []

    if voiceover_end is None:
        cuts = spread_then_snap(beats, needed, 0.0, duration, min_clip_seconds=min_clip_seconds)
        if len(cuts) < needed:
            fallback = "even_split_remainder"
            start = cuts[-1] if cuts else 0.0
            remaining = needed - len(cuts)
            span = duration - start
            for index in range(1, remaining + 1):
                cuts.append(start + (span * index / (remaining + 1)))
            cuts = _enforce_spacing(cuts, 0.0, duration, min_clip_seconds, needed)
        log.append({"rule": "spread_full", "added": cuts})
        return cuts, {
            "rules_applied": log,
            "fallback": fallback,
            "beat_count": len(beats),
            "strategy": "spread",
            "effective_clip_count": max(1, len(cuts) + 1),
            "recycle": False,
            "voiceover_end_seconds": None,
        }

    vo_beats = [time for time in beats if time < voiceover_end]
    tail_beats = [time for time in beats if time >= voiceover_end]
    vo_strengths = [strengths[index] for index, time in enumerate(beats) if time < voiceover_end]
    tail_strengths = [strengths[index] for index, time in enumerate(beats) if time >= voiceover_end]
    vo_budget = max(1, round(vo_share * max(needed, 1))) if needed else 0
    if needed:
        vo_budget = min(vo_budget, max(1, needed - 1)) if tail_beats or voiceover_end < duration else needed

    vo_candidates = _every_n_from(vo_beats, vo_every_n)
    has_vo_room = voiceover_end >= (2 * min_clip_seconds) and bool(vo_beats)
    interior = max(1 if has_vo_room else 0, vo_budget - 1)
    if needed and (tail_beats or voiceover_end < duration):
        interior = min(interior, max(0, needed - 1))
    interior = min(interior, len(vo_candidates) or interior)
    if use_spread:
        vo_cuts = spread_then_snap(vo_beats, interior, 0.0, voiceover_end, min_clip_seconds=min_clip_seconds)
    else:
        vo_cuts = vo_candidates[:interior]
    log.append({"rule": {"until": "voiceover_end", "every_n_beats": vo_every_n, "spread": use_spread}, "added": list(vo_cuts)})

    boundary = _nearest_unused(voiceover_end, beats, set(), max(0.0, voiceover_end - (_median_gap(beats) * 2)), duration)
    if boundary is None:
        boundary = voiceover_end
    last_vo = vo_cuts[-1] if vo_cuts else 0.0
    if boundary > last_vo + min_clip_seconds and boundary < duration - min_clip_seconds:
        vo_cuts.append(round(float(boundary), 4))
        log.append({"rule": "voiceover_boundary", "added": [vo_cuts[-1]]})

    last_cut = vo_cuts[-1] if vo_cuts else 0.0
    tail_pool = [time for time in tail_beats if time > last_cut + (min_clip_seconds * 0.5)]
    tail_pool_strengths = [
        tail_strengths[index]
        for index, time in enumerate(tail_beats)
        if time > last_cut + (min_clip_seconds * 0.5)
    ]
    tail_candidates = _every_n_from(tail_pool, tail_every_n)
    tail_candidate_strengths = [
        tail_pool_strengths[index]
        for index in range(tail_every_n - 1, len(tail_pool), tail_every_n)
        if index < len(tail_pool_strengths)
    ]

    if recycle:
        tail_cuts = list(tail_candidates)
        fallback = "recycle_tail" if tail_cuts else fallback
        log.append({"rule": {"remaining": True, "every_n_beats": tail_every_n, "recycle": True}, "added": list(tail_cuts)})
        cuts = vo_cuts + tail_cuts
        cuts = _enforce_spacing(cuts, 0.0, duration, min_clip_seconds, len(cuts))
        return cuts, {
            "rules_applied": log,
            "fallback": fallback,
            "beat_count": len(beats),
            "strategy": "vo_phased",
            "effective_clip_count": max(1, len(cuts) + 1),
            "recycle": True,
            "voiceover_end_seconds": voiceover_end,
        }

    remaining_needed = max(0, needed - len(vo_cuts))
    if remaining_needed <= 0:
        cuts = _enforce_spacing(vo_cuts, 0.0, duration, min_clip_seconds, len(vo_cuts))
        return cuts, {
            "rules_applied": log,
            "fallback": fallback,
            "beat_count": len(beats),
            "strategy": "vo_phased",
            "effective_clip_count": max(1, len(cuts) + 1),
            "recycle": False,
            "voiceover_end_seconds": voiceover_end,
        }

    tail_cuts = _thin_beats(
        tail_candidates or tail_pool,
        tail_candidate_strengths or tail_pool_strengths,
        remaining_needed,
        min_clip_seconds=min_clip_seconds,
        duration=duration,
        start=last_cut,
    )
    if len(tail_cuts) < remaining_needed:
        fallback = "even_split_remainder"
        start = tail_cuts[-1] if tail_cuts else last_cut
        span = duration - start
        extra = remaining_needed - len(tail_cuts)
        for index in range(1, extra + 1):
            tail_cuts.append(start + (span * index / (extra + 1)))
    log.append({"rule": {"remaining": True, "every_n_beats": tail_every_n, "thin": True}, "added": list(tail_cuts)})
    cuts = vo_cuts + tail_cuts
    cuts = _enforce_spacing(cuts, 0.0, duration, min_clip_seconds, needed)
    return cuts, {
        "rules_applied": log,
        "fallback": fallback,
        "beat_count": len(beats),
        "strategy": "vo_phased",
        "effective_clip_count": max(1, len(cuts) + 1),
        "recycle": False,
        "voiceover_end_seconds": voiceover_end,
    }


def apply_rules(
    beats_in_window: list[float],
    clip_count: int,
    duration_seconds: float,
    rules: dict[str, Any] | None,
    *,
    min_clip_seconds: float = 0.4,
    voiceover_end_seconds: float | None = None,
    beat_strengths: list[float] | None = None,
) -> tuple[list[float], dict[str, Any]]:
    needed = max(0, int(clip_count) - 1)
    duration = max(float(duration_seconds), min_clip_seconds)
    paired = [
        (float(time), float(beat_strengths[index]) if beat_strengths and index < len(beat_strengths) else 1.0)
        for index, time in enumerate(beats_in_window)
        if 0 <= float(time) < duration
    ]
    paired.sort(key=lambda item: item[0])
    beats = [item[0] for item in paired]
    strengths = [item[1] for item in paired]
    payload = rules if isinstance(rules, dict) else {}
    rule_list = list(payload.get("rules") or [])
    if not rule_list and str(payload.get("strategy") or "").strip().lower() != "vo_phased":
        rule_list = list(DEFAULT_RULES["rules"])
        payload = {**DEFAULT_RULES, **payload}

    voiceover_end = _resolve_voiceover_end(voiceover_end_seconds, payload, duration)
    if _uses_phased(payload, rule_list):
        return _apply_phased(
            beats,
            strengths,
            int(clip_count),
            duration,
            payload,
            rule_list,
            min_clip_seconds,
            voiceover_end,
        )
    if not rule_list:
        rule_list = list(DEFAULT_RULES["rules"])
    return _apply_legacy(beats, needed, duration, rule_list, min_clip_seconds)
