"""Timed Script Render Mode.

Imported scene timestamps and voiceover lines are stored as a structured
``[timed-script]`` directive on Production Request notes, alongside the existing
``[render-settings]`` and ``[render-overrides]`` directives. The visible notes
field stays free of that payload because Studio strips the directive before
showing it.

Import clocks are ordering/split hints. After P2 synthesizes per-scene
voiceover, measured MP3 lengths rewrite each scene window so still N lasts
exactly as long as scene N speech. Pacing, fixed image duration, and beat sync
must not override those measured windows. Suggested-still text is assignment
context only and is never narration.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import unquote

from render.fields import field_str

FPS = 30
WORDS_PER_MINUTE = 150
MAX_SLIGHT_SPEECH_RATE = 1.15
MAX_SPEECH_RATE = 1.2
MIN_SPEECH_RATE = 0.7
MIN_SCENE_SECONDS = 1.0
BOUNDARY_EPSILON_SECONDS = 0.05
SLIDE_VOICEOVER_SOURCE = "slide_voiceover"
DEFAULT_SILENT_HOLD_SECONDS = 2.5
MAX_SILENT_HOLD_SECONDS = 8.0

_TIMED_SCRIPT_RE = re.compile(r"(?:^|\n)\[timed-script\]\s*([^\n]*)", re.I)
_RANGE_RE = re.compile(
    r"^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[\u2012\u2013\u2014\-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$"
)
_SEPARATOR_CELL_RE = re.compile(r"^:?-{3,}:?$")


def _round_seconds(value: float) -> float:
    return round(float(value) + 0.0, 3)


def parse_clock(value: str) -> float | None:
    text = str(value or "").strip()
    if not re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", text):
        return None
    parts = [int(part) for part in text.split(":")]
    if len(parts) == 2:
        minutes, seconds = parts
        if seconds > 59:
            return None
        return float(minutes * 60 + seconds)
    if len(parts) == 3:
        hours, minutes, seconds = parts
        if minutes > 59 or seconds > 59:
            return None
        return float(hours * 3600 + minutes * 60 + seconds)
    return None


def format_clock(seconds: float) -> str:
    total = max(0, int(round(float(seconds or 0))))
    minutes, secs = divmod(total, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def parse_time_range(value: str) -> tuple[float, float] | None:
    match = _RANGE_RE.match(str(value or "").strip())
    if not match:
        return None
    start = parse_clock(match.group(1))
    end = parse_clock(match.group(2))
    if start is None or end is None:
        return None
    return start, end


def _strip_wrapping_quotes(value: str) -> str:
    text = str(value or "").replace("\u00a0", " ").strip()
    pairs = (('"', '"'), ("'", "'"), ("\u201c", "\u201d"), ("\u2018", "\u2019"))
    for left, right in pairs:
        if len(text) >= 2 and text.startswith(left) and text.endswith(right):
            return text[1:-1].strip()
    return text


def _cells(line: str) -> list[str]:
    raw = str(line or "").strip()
    if "|" not in raw:
        return []
    parts = [part.replace("\u00a0", " ").strip() for part in raw.split("|")]
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def _is_separator(cells: list[str]) -> bool:
    return bool(cells) and all(_SEPARATOR_CELL_RE.match(cell.replace(" ", "")) for cell in cells)


def _header_indexes(cells: list[str]) -> dict[str, int] | None:
    labels = [cell.strip().lower() for cell in cells]
    if not labels or not any("time" in label for label in labels):
        return None
    indexes = {"time": 0, "voiceover": 1 if len(labels) > 1 else 0, "visual": 2 if len(labels) > 2 else 1}
    for index, label in enumerate(labels):
        if "time" in label:
            indexes["time"] = index
        elif any(token in label for token in ("voice", "narrat", "script")):
            indexes["voiceover"] = index
        elif any(token in label for token in ("still", "visual", "scene", "suggest")):
            indexes["visual"] = index
    return indexes


def estimate_narration_seconds(text: str, speech_rate: float = 1.0) -> float:
    words = [word for word in str(text or "").split() if word]
    if not words:
        return 0.0
    try:
        rate = float(speech_rate or 1.0)
    except (TypeError, ValueError):
        rate = 1.0
    if rate <= 0:
        rate = 1.0
    return (len(words) / WORDS_PER_MINUTE) * 60.0 / rate


def narration_fit(segment: dict[str, Any]) -> dict[str, Any]:
    duration = float(segment.get("duration_seconds") or 0)
    rate = float(segment.get("speech_rate") or 1.0)
    estimated = estimate_narration_seconds(str(segment.get("voiceover_text") or ""), rate)
    spare = _round_seconds(duration - estimated)
    overrun = spare < -BOUNDARY_EPSILON_SECONDS
    return {
        "scene_seconds": _round_seconds(duration),
        "narration_seconds": _round_seconds(estimated),
        "spare_seconds": spare,
        "status": "over" if overrun else "ready",
        "speech_rate": _round_seconds(rate),
        "message": (
            f"Narration exceeds scene by {abs(spare):.1f} sec"
            if overrun
            else f"Scene: {duration:.1f} sec • VO: {estimated:.1f} sec • Spare: {max(0.0, spare):.1f} sec"
        ),
    }


def segment_duration_frames(segment: dict[str, Any], fps: int = FPS) -> int:
    start = int(round(float(segment.get("start_seconds") or 0) * fps))
    end = int(round(float(segment.get("end_seconds") or 0) * fps))
    return end - start


def validate_timeline(segments: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    rows = [segment for segment in segments if isinstance(segment, dict)]
    if not rows:
        return ["No timeline scenes to validate."]
    previous_end: float | None = None
    for index, segment in enumerate(rows, start=1):
        try:
            start = float(segment.get("start_seconds"))
            end = float(segment.get("end_seconds"))
        except (TypeError, ValueError):
            issues.append(f"Scene {index}: invalid timestamps.")
            previous_end = None
            continue
        if start < 0 or end < 0:
            issues.append(f"Scene {index}: invalid timestamps.")
        if end < start:
            issues.append(f"Scene {index}: end {format_clock(end)} is before start {format_clock(start)}.")
        elif end == start or float(segment.get("duration_seconds") or 0) <= 0:
            issues.append(f"Scene {index}: zero-length scene.")
        elif float(segment.get("duration_seconds") or 0) + 1e-9 < MIN_SCENE_SECONDS:
            issues.append(
                f"Scene {index}: duration is under {MIN_SCENE_SECONDS:.1f} sec. "
                "The renderer keeps each scene at least 1 second, so this boundary would move."
            )
        if previous_end is not None:
            gap = start - previous_end
            if gap > BOUNDARY_EPSILON_SECONDS:
                issues.append(f"Gap of {gap:.1f} sec between scene {index - 1} and scene {index}.")
            elif gap < -BOUNDARY_EPSILON_SECONDS:
                issues.append(f"Overlap of {abs(gap):.1f} sec between scene {index - 1} and scene {index}.")
        previous_end = end
    return issues


def _empty_timeline() -> dict[str, Any]:
    return {
        "mode": "timed_script",
        "timing_mode": "authoritative",
        "timing_source": "timed_script",
        "duration_seconds": 0,
        "force_exact_voiceover": True,
        "segments": [],
    }


def build_timeline(segments: list[dict[str, Any]]) -> dict[str, Any]:
    timeline = _empty_timeline()
    cleaned: list[dict[str, Any]] = []
    for index, raw in enumerate(segments, start=1):
        if not isinstance(raw, dict):
            continue
        try:
            start = float(raw.get("start_seconds"))
            end = float(raw.get("end_seconds"))
        except (TypeError, ValueError):
            continue
        try:
            rate = float(raw.get("speech_rate") or 1.0)
        except (TypeError, ValueError):
            rate = 1.0
        rate = min(MAX_SPEECH_RATE, max(MIN_SPEECH_RATE, rate))
        asset_id = str(raw.get("asset_id") or "").strip()
        voiceover_text = _strip_wrapping_quotes(str(raw.get("voiceover_text") or ""))
        silent = bool(raw.get("silent")) or not voiceover_text
        try:
            hold = float(raw.get("hold_seconds") or 0)
        except (TypeError, ValueError):
            hold = 0.0
        if silent:
            voiceover_text = ""
            if hold <= 0:
                hold = end - start if end > start else DEFAULT_SILENT_HOLD_SECONDS
            hold = min(MAX_SILENT_HOLD_SECONDS, max(MIN_SCENE_SECONDS, hold))
        segment = {
            "index": index,
            "start_seconds": _round_seconds(start),
            "end_seconds": _round_seconds(end),
            "duration_seconds": _round_seconds(end - start),
            "voiceover_text": voiceover_text,
            "suggested_visual": str(raw.get("suggested_visual") or "").strip(),
            "asset_id": asset_id,
            "speech_rate": _round_seconds(rate),
            "force_exact_voiceover": True,
            "silent": silent,
        }
        if silent:
            segment["hold_seconds"] = _round_seconds(hold)
        measured = raw.get("measured_voiceover_seconds")
        if measured not in (None, ""):
            try:
                segment["measured_voiceover_seconds"] = _round_seconds(float(measured))
            except (TypeError, ValueError):
                pass
        cleaned.append(segment)
    timeline["segments"] = cleaned
    timeline["duration_seconds"] = _round_seconds(max((segment["end_seconds"] for segment in cleaned), default=0))
    return timeline


def parse_timed_script_markdown(text: str) -> dict[str, Any]:
    """Parse a Markdown table of time, voiceover, and suggested still."""
    errors: list[str] = []
    header: dict[str, int] | None = None
    raw_segments: list[dict[str, Any]] = []
    saw_row = False
    for line_number, line in enumerate(str(text or "").splitlines(), start=1):
        if not str(line).strip():
            continue
        cells = _cells(line)
        if not cells:
            continue
        if _is_separator(cells):
            continue
        if header is None and _header_indexes(cells):
            header = _header_indexes(cells)
            continue
        saw_row = True
        indexes = header or {"time": 0, "voiceover": 1, "visual": 2}
        if len(cells) <= indexes["time"]:
            errors.append(f"Line {line_number}: could not read a time range.")
            continue
        parsed = parse_time_range(cells[indexes["time"]])
        if not parsed:
            errors.append(f"Line {line_number}: invalid timestamp '{cells[indexes['time']]}'. Use 0:00–0:07.")
            continue
        start, end = parsed
        voiceover = ""
        visual = ""
        if len(cells) > indexes["voiceover"]:
            voiceover = _strip_wrapping_quotes(cells[indexes["voiceover"]])
        if len(cells) > indexes["visual"]:
            visual = cells[indexes["visual"]].strip()
        raw_segments.append({
            "start_seconds": start,
            "end_seconds": end,
            "voiceover_text": voiceover,
            "suggested_visual": visual,
            "asset_id": "",
            "speech_rate": 1.0,
        })
    if not saw_row and not raw_segments:
        errors.append("No timed-script rows found. Paste a Markdown table with Time, Voiceover, and Suggested still.")
    timeline = build_timeline(raw_segments) if raw_segments else None
    issues = validate_timeline(timeline["segments"]) if timeline else []
    return {
        "ok": not errors and not issues and bool(timeline and timeline["segments"]),
        "errors": errors,
        "issues": issues,
        "timeline": timeline,
    }


def _parse_json_object(text: str) -> Any | None:
    """Parse the first JSON object even when trailing note tokens follow it.

    Live Production Notes often look like:
    ``[timed-script] {...}; ez-photo-wait=off; ez-photo-reject=rec...``
    because photo-wait tokens were appended with ``; `` onto the same line.
    ``json.loads`` rejects that; ``raw_decode`` keeps the timeline readable.
    """
    payload = str(text or "").strip()
    if not payload:
        return None
    start = payload.find("{")
    if start < 0:
        return None
    try:
        value, _end = json.JSONDecoder().raw_decode(payload[start:])
    except json.JSONDecodeError:
        return None
    return value


def normalize_timeline(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, str):
        raw = _parse_json_object(raw)
        if raw is None:
            return None
    if not isinstance(raw, dict):
        return None
    segments = raw.get("segments")
    if not isinstance(segments, list) or not segments:
        return None
    timeline = build_timeline(segments)
    if not timeline["segments"]:
        return None
    if str(raw.get("source") or "").strip() == SLIDE_VOICEOVER_SOURCE:
        timeline["source"] = SLIDE_VOICEOVER_SOURCE
    return timeline


def timed_script_from_request(request: dict[str, Any] | None) -> dict[str, Any] | None:
    notes = field_str(request or {}, "Production_Notes")
    match = _TIMED_SCRIPT_RE.search(notes)
    if not match:
        return None
    payload = str(match.group(1) or "").strip()
    if not payload:
        return None
    decoded = unquote(payload)
    timeline = normalize_timeline(decoded)
    if timeline:
        return timeline
    return normalize_timeline(payload)


def directive_line(timeline: dict[str, Any] | None) -> str:
    normalized = normalize_timeline(timeline)
    if not normalized:
        return ""
    return "[timed-script] " + json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)


def strip_timed_script_directive(notes: str) -> str:
    cleaned = _TIMED_SCRIPT_RE.sub("", str(notes or ""))
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


def notes_with_timed_script(notes: str, timeline: dict[str, Any] | None) -> str:
    """Replace or append the ``[timed-script]`` directive while keeping other notes."""
    line = directive_line(timeline)
    cleaned = strip_timed_script_directive(notes)
    if not line:
        return cleaned
    if cleaned:
        return f"{cleaned}\n{line}".strip()
    return line


def apply_measured_durations(
    timeline: dict[str, Any] | None,
    measured_seconds: list[float],
) -> dict[str, Any] | None:
    """Rebuild authoritative scene windows from measured per-scene voiceover lengths.

    Imported clock ranges are planning hints only. Once ElevenLabs has spoken each
    scene, still ``durationFrames`` must follow the real audio — not 150 WPM estimates.
    """
    normalized = normalize_timeline(timeline)
    if not normalized:
        return None
    segments = [segment for segment in normalized.get("segments") or [] if isinstance(segment, dict)]
    if not segments or len(measured_seconds) != len(segments):
        raise ValueError(
            f"measured duration count {len(measured_seconds)} does not match "
            f"timed-script scene count {len(segments)}"
        )
    rebuilt: list[dict[str, Any]] = []
    cursor = 0.0
    for segment, raw_seconds in zip(segments, measured_seconds):
        try:
            seconds = float(raw_seconds)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid measured duration {raw_seconds!r}") from exc
        seconds = max(MIN_SCENE_SECONDS, seconds)
        start = cursor
        end = cursor + seconds
        rebuilt.append({
            **segment,
            "start_seconds": start,
            "end_seconds": end,
            "duration_seconds": seconds,
            "speech_rate": 1.0,
            "force_exact_voiceover": True,
            "measured_voiceover_seconds": _round_seconds(seconds),
        })
        cursor = end
    return build_timeline(rebuilt)


def exact_voiceover_text(timeline: dict[str, Any] | None) -> str:
    """Join authoritative narration. Suggested-still text is never included."""
    if not timeline:
        return ""
    parts = []
    for segment in timeline.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        text = str(segment.get("voiceover_text") or "").strip()
        if text:
            parts.append(text)
    return " ".join(parts).strip()


def slight_speech_rate(segment: dict[str, Any]) -> float:
    """Cap a single scene at a small speed-up. Does not rewrite the words."""
    duration = float(segment.get("duration_seconds") or 0)
    estimate = estimate_narration_seconds(str(segment.get("voiceover_text") or ""), 1.0)
    if duration <= 0 or estimate <= duration + BOUNDARY_EPSILON_SECONDS:
        return 1.0
    needed = estimate / duration
    return _round_seconds(min(MAX_SLIGHT_SPEECH_RATE, max(1.0, needed)))


def speech_speed_for_timeline(timeline: dict[str, Any] | None) -> float:
    if not timeline:
        return 1.0
    rates = []
    for segment in timeline.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        try:
            rates.append(float(segment.get("speech_rate") or 1.0))
        except (TypeError, ValueError):
            continue
    if not rates:
        return 1.0
    return min(MAX_SPEECH_RATE, max(MIN_SPEECH_RATE, max(rates)))


def suggested_visuals(timeline: dict[str, Any] | None) -> list[str]:
    if not timeline:
        return []
    return [
        str(segment.get("suggested_visual") or "").strip()
        for segment in timeline.get("segments") or []
        if isinstance(segment, dict)
    ]


def _even_groups(items: list[str], count: int) -> list[list[str]]:
    groups: list[list[str]] = [[] for _ in range(count)]
    total = len(items)
    if total <= 0 or count <= 0:
        return groups
    for index, item in enumerate(items):
        bucket = min(count - 1, index * count // total)
        groups[bucket].append(item)
    return groups


def chunk_script_across_slides(script: str, count: int) -> list[dict[str, Any]]:
    """Split one narration blob into one line per still.

    Explicit per-slide lines are preferred. This is the fallback when a photo
    reel only has a single script.
    """
    slide_count = max(0, int(count))
    text = " ".join(str(script or "").split())
    if slide_count <= 0:
        return []
    if not text:
        return [
            {"line": "", "hold_seconds": DEFAULT_SILENT_HOLD_SECONDS, "silent": True}
            for _ in range(slide_count)
        ]
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    pieces = sentences if len(sentences) >= slide_count else text.split()
    if not pieces:
        pieces = [text]
    lines: list[dict[str, Any]] = []
    for group in _even_groups(pieces, slide_count):
        line = " ".join(group).strip()
        if line:
            lines.append({"line": line, "hold_seconds": 0.0, "silent": False})
        else:
            lines.append({
                "line": "",
                "hold_seconds": DEFAULT_SILENT_HOLD_SECONDS,
                "silent": True,
            })
    return lines


def slide_lines_from_themes(themes: dict[str, Any] | None, count: int) -> list[dict[str, Any]]:
    """Read one spoken line or an explicit silent hold for each finished slide."""
    slide_count = max(0, int(count))
    raw = (themes or {}).get("slide_voiceovers") if isinstance(themes, dict) else None
    if isinstance(raw, list) and slide_count > 0 and len(raw) == slide_count:
        lines: list[dict[str, Any]] = []
        for item in raw:
            if isinstance(item, str):
                text = item.strip()
                lines.append({
                    "line": text,
                    "hold_seconds": 0.0 if text else DEFAULT_SILENT_HOLD_SECONDS,
                    "silent": not text,
                })
                continue
            if not isinstance(item, dict):
                lines.append({
                    "line": "",
                    "hold_seconds": DEFAULT_SILENT_HOLD_SECONDS,
                    "silent": True,
                })
                continue
            text = str(item.get("line") or item.get("voiceover_text") or "").strip()
            try:
                hold = float(item.get("hold_seconds") or 0)
            except (TypeError, ValueError):
                hold = 0.0
            silent = not text or bool(item.get("silent"))
            if silent and hold <= 0:
                hold = DEFAULT_SILENT_HOLD_SECONDS
            lines.append({
                "line": "" if silent else text,
                "hold_seconds": hold if silent else 0.0,
                "silent": silent,
            })
        return lines
    script = str((themes or {}).get("voiceover_script") or "").strip() if isinstance(themes, dict) else ""
    if script and slide_count > 0:
        return chunk_script_across_slides(script, slide_count)
    return []


def timeline_from_slide_lines(
    lines: list[dict[str, Any]],
    assets: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Planning windows only. P2 replaces spoken windows with measured audio."""
    rows = [line for line in lines or [] if isinstance(line, dict)]
    if not rows:
        return None
    ordered = sorted(
        [asset for asset in assets or [] if isinstance(asset, dict)],
        key=lambda asset: int(asset.get("order") or 0),
    )
    raw_segments: list[dict[str, Any]] = []
    cursor = 0.0
    for index, line in enumerate(rows):
        text = str(line.get("line") or line.get("voiceover_text") or "").strip()
        silent = bool(line.get("silent")) or not text
        if silent:
            try:
                seconds = float(line.get("hold_seconds") or 0)
            except (TypeError, ValueError):
                seconds = 0.0
            if seconds <= 0:
                seconds = DEFAULT_SILENT_HOLD_SECONDS
            seconds = min(MAX_SILENT_HOLD_SECONDS, max(MIN_SCENE_SECONDS, seconds))
            text = ""
        else:
            seconds = max(MIN_SCENE_SECONDS, estimate_narration_seconds(text))
        asset = ordered[index] if index < len(ordered) else {}
        asset_id = str(asset.get("id") or asset.get("media_asset_record_id") or "").strip()
        raw_segments.append({
            "start_seconds": cursor,
            "end_seconds": cursor + seconds,
            "voiceover_text": text,
            "suggested_visual": str(asset.get("caption") or "").strip(),
            "asset_id": asset_id,
            "speech_rate": 1.0,
            "silent": silent,
            "hold_seconds": seconds if silent else 0.0,
        })
        cursor += seconds
    timeline = build_timeline(raw_segments)
    if not timeline.get("segments"):
        return None
    timeline["source"] = SLIDE_VOICEOVER_SOURCE
    return timeline


_STILL_KEY_RE = re.compile(r"\s+")
_STILL_EXT_RE = re.compile(r"\.[a-z0-9]{2,4}$", re.I)


def still_match_key(value: str | None) -> str:
    text = str(value or "")
    text = text.replace("**", "")
    for token in ('"', "“", "”", "'", "#"):
        text = text.replace(token, " ")
    text = _STILL_EXT_RE.sub("", text)
    text = text.replace("_", " ").replace("-", " ")
    return _STILL_KEY_RE.sub(" ", text).strip().lower()


def _asset_still_id(asset: dict[str, Any]) -> str:
    return str(asset.get("id") or asset.get("media_asset_record_id") or "").strip()


def _asset_still_labels(asset: dict[str, Any]) -> list[str]:
    return [
        still_match_key(asset.get(key))
        for key in ("name", "file_name", "filename", "title", "caption", "asset_name")
        if still_match_key(asset.get(key))
    ]


def still_name_matches(suggested: str | None, asset: dict[str, Any] | None) -> bool:
    want = still_match_key(suggested)
    if not want or not isinstance(asset, dict):
        return False
    pattern = re.compile(rf"(?:^|\s){re.escape(want)}(?:\s|\.|$)")
    return any(label == want or pattern.search(label) for label in _asset_still_labels(asset))


def assign_stills_in_order(timeline: dict[str, Any], assets: list[dict[str, Any]]) -> dict[str, Any]:
    """Map scenes to stills by Suggested still name, then fill leftovers in order.

    Extra attached photos are ignored. Equal counts with no names still map 1:1
    in master order so existing eight-scene fixtures keep working.
    """
    normalized = normalize_timeline(timeline)
    if not normalized:
        return timeline
    ordered = sorted(
        [asset for asset in assets or [] if isinstance(asset, dict)],
        key=lambda asset: int(asset.get("order") or 0),
    )
    segments = normalized["segments"]
    used: set[str] = set()

    def take(asset: dict[str, Any]) -> str:
        asset_id = _asset_still_id(asset)
        if not asset_id or asset_id in used:
            return ""
        used.add(asset_id)
        return asset_id

    for segment in segments:
        segment["asset_id"] = ""
    for segment in segments:
        match = next(
            (
                asset
                for asset in ordered
                if _asset_still_id(asset) not in used and still_name_matches(segment.get("suggested_visual"), asset)
            ),
            None,
        )
        if match:
            segment["asset_id"] = take(match)
    unused = [asset for asset in ordered if _asset_still_id(asset) not in used]
    for segment in segments:
        if str(segment.get("asset_id") or "").strip():
            continue
        if not unused:
            break
        segment["asset_id"] = take(unused.pop(0))
    return normalized


def clip_is_authoritative(clip: dict[str, Any] | None) -> bool:
    if not isinstance(clip, dict):
        return False
    directive = clip.get("renderDirective") if isinstance(clip.get("renderDirective"), dict) else {}
    tokens = [
        clip.get("timingMode"),
        clip.get("timing_mode"),
        clip.get("timingSource"),
        clip.get("timing_source"),
        directive.get("timingMode"),
        directive.get("timingSource"),
    ]
    folded = {str(token or "").strip().lower() for token in tokens}
    return "authoritative" in folded or "timed_script" in folded


def clips_use_authoritative_timing(clips: list[Any] | None) -> bool:
    rows = [clip for clip in clips or [] if isinstance(clip, dict)]
    return bool(rows) and any(clip_is_authoritative(clip) for clip in rows)


def output_uses_authoritative_timing(output: dict[str, Any] | None) -> bool:
    from render.fields import field, parse_json_field

    parsed = parse_json_field(field(output or {}, "Render_Clip_List_JSON"))
    return clips_use_authoritative_timing(parsed if isinstance(parsed, list) else [])
