from __future__ import annotations

from typing import Any, Callable

DEFAULT_RULES: dict[str, Any] = {"rules": [{"remaining": True, "every_n_beats": 2}]}

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


def apply_rules(
    beats_in_window: list[float],
    clip_count: int,
    duration_seconds: float,
    rules: dict[str, Any] | None,
    *,
    min_clip_seconds: float = 0.4,
) -> tuple[list[float], dict[str, Any]]:
    needed = max(0, int(clip_count) - 1)
    duration = max(float(duration_seconds), min_clip_seconds)
    beats = sorted(float(b) for b in beats_in_window if 0 <= float(b) < duration)
    payload = rules if isinstance(rules, dict) else {}
    rule_list = list(payload.get("rules") or [])
    if not rule_list:
        rule_list = list(DEFAULT_RULES["rules"])

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

    clamped: list[float] = []
    cursor = 0.0
    for cut in cuts[:needed]:
        earliest = cursor + min_clip_seconds
        latest = duration - (min_clip_seconds * (needed - len(clamped)))
        value = min(max(cut, earliest), max(earliest, latest))
        clamped.append(round(value, 4))
        cursor = value
    return clamped, {"rules_applied": log, "fallback": fallback, "beat_count": len(beats)}
