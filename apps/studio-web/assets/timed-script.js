/* Timed Script Render Mode parser. Pipeline copy: studio_produce/timed_script.py */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StudioTimedScript = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const WORDS_PER_MINUTE = 150;
  const MAX_SLIGHT_SPEECH_RATE = 1.15;
  const MAX_SPEECH_RATE = 1.2;
  const MIN_SPEECH_RATE = 0.7;
  const MIN_SCENE_SECONDS = 1;
  const BOUNDARY_EPSILON_SECONDS = 0.05;
  const RANGE_RE = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[\u2012\u2013\u2014-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
  const SEPARATOR_CELL_RE = /^:?-{3,}:?$/;

  function roundSeconds(value) {
    return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
  }

  function parseClock(value) {
    const text = String(value || "").trim();
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return null;
    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      if (seconds > 59) return null;
      return minutes * 60 + seconds;
    }
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      if (minutes > 59 || seconds > 59) return null;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  }

  function formatClock(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours) return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function stripMarkdownMarks(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[*_`]/g, "").trim();
  }

  function parseTimeRange(value) {
    const match = RANGE_RE.exec(stripMarkdownMarks(value));
    if (!match) return null;
    const start = parseClock(match[1]);
    const end = parseClock(match[2]);
    if (start == null || end == null) return null;
    return [start, end];
  }

  function stripWrappingQuotes(value) {
    const text = String(value || "").replace(/\u00a0/g, " ").trim();
    const pairs = [['"', '"'], ["'", "'"], ["\u201c", "\u201d"], ["\u2018", "\u2019"]];
    for (const [left, right] of pairs) {
      if (text.length >= 2 && text.startsWith(left) && text.endsWith(right)) return text.slice(1, -1).trim();
    }
    return text;
  }

  function cells(line) {
    const raw = String(line || "").replace(/\u00a0/g, " ").trim();
    if (!raw) return [];
    const splitOn = raw.includes("|") ? "|" : (raw.includes("\t") ? "\t" : "");
    if (!splitOn) return [];
    let parts = raw.split(splitOn).map((part) => part.replace(/\u00a0/g, " ").trim());
    if (splitOn === "|" && parts.length && parts[0] === "") parts = parts.slice(1);
    if (splitOn === "|" && parts.length && parts[parts.length - 1] === "") parts = parts.slice(0, -1);
    return parts;
  }

  function isSeparator(row) {
    return row.length > 0 && row.every((cell) => SEPARATOR_CELL_RE.test(cell.replace(/ /g, "")));
  }

  function headerIndexes(row) {
    const labels = row.map((cell) => cell.trim().toLowerCase());
    if (!labels.length || !labels.some((label) => label.includes("time"))) return null;
    const indexes = { time: 0, voiceover: labels.length > 1 ? 1 : 0, visual: labels.length > 2 ? 2 : 1 };
    labels.forEach((label, index) => {
      if (label.includes("time")) indexes.time = index;
      else if (/(voice|narrat|script)/.test(label)) indexes.voiceover = index;
      else if (/(still|visual|scene|suggest)/.test(label)) indexes.visual = index;
    });
    return indexes;
  }

  function estimateNarrationSeconds(text, speechRate) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return 0;
    let rate = Number(speechRate || 1);
    if (!Number.isFinite(rate) || rate <= 0) rate = 1;
    return (words.length / WORDS_PER_MINUTE) * 60 / rate;
  }

  function narrationFit(segment) {
    const duration = Number(segment?.duration_seconds) || 0;
    const rate = Number(segment?.speech_rate) || 1;
    const estimated = estimateNarrationSeconds(segment?.voiceover_text, rate);
    const spare = roundSeconds(duration - estimated);
    const overrun = spare < -BOUNDARY_EPSILON_SECONDS;
    return {
      scene_seconds: roundSeconds(duration),
      narration_seconds: roundSeconds(estimated),
      spare_seconds: spare,
      status: overrun ? "over" : "ready",
      speech_rate: roundSeconds(rate),
      message: overrun
        ? `Narration exceeds scene by ${Math.abs(spare).toFixed(1)} sec`
        : `Scene: ${duration.toFixed(1)} sec • VO: ${estimated.toFixed(1)} sec • Spare: ${Math.max(0, spare).toFixed(1)} sec`,
    };
  }

  function segmentDurationFrames(segment, fps) {
    const rate = fps || 30;
    const start = Math.round(Number(segment?.start_seconds || 0) * rate);
    const end = Math.round(Number(segment?.end_seconds || 0) * rate);
    return end - start;
  }

  function validateTimeline(segments) {
    const issues = [];
    const rows = Array.isArray(segments) ? segments : [];
    if (!rows.length) return ["No timeline scenes to validate."];
    let previousEnd = null;
    rows.forEach((segment, offset) => {
      const index = offset + 1;
      const start = Number(segment?.start_seconds);
      const end = Number(segment?.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        issues.push(`Scene ${index}: invalid timestamps.`);
        previousEnd = null;
        return;
      }
      if (start < 0 || end < 0) issues.push(`Scene ${index}: invalid timestamps.`);
      if (end < start) issues.push(`Scene ${index}: end ${formatClock(end)} is before start ${formatClock(start)}.`);
      else if (end === start || Number(segment?.duration_seconds) <= 0) issues.push(`Scene ${index}: zero-length scene.`);
      else if (Number(segment?.duration_seconds) + 1e-9 < MIN_SCENE_SECONDS) {
        issues.push(`Scene ${index}: duration is under ${MIN_SCENE_SECONDS.toFixed(1)} sec. The renderer keeps each scene at least 1 second, so this boundary would move.`);
      }
      if (previousEnd != null) {
        const gap = start - previousEnd;
        if (gap > BOUNDARY_EPSILON_SECONDS) issues.push(`Gap of ${gap.toFixed(1)} sec between scene ${index - 1} and scene ${index}.`);
        else if (gap < -BOUNDARY_EPSILON_SECONDS) issues.push(`Overlap of ${Math.abs(gap).toFixed(1)} sec between scene ${index - 1} and scene ${index}.`);
      }
      previousEnd = end;
    });
    return issues;
  }

  function buildTimeline(segments) {
    const cleaned = [];
    (Array.isArray(segments) ? segments : []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const start = Number(raw.start_seconds);
      const end = Number(raw.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      let rate = Number(raw.speech_rate || 1);
      if (!Number.isFinite(rate)) rate = 1;
      rate = Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, rate));
      cleaned.push({
        index: cleaned.length + 1,
        start_seconds: roundSeconds(start),
        end_seconds: roundSeconds(end),
        duration_seconds: roundSeconds(end - start),
        voiceover_text: stripWrappingQuotes(raw.voiceover_text || ""),
        suggested_visual: String(raw.suggested_visual || "").trim(),
        asset_id: String(raw.asset_id || "").trim(),
        speech_rate: roundSeconds(rate),
        force_exact_voiceover: true,
      });
    });
    const duration = cleaned.reduce((max, segment) => Math.max(max, segment.end_seconds), 0);
    return {
      mode: "timed_script",
      timing_mode: "authoritative",
      timing_source: "timed_script",
      duration_seconds: roundSeconds(duration),
      force_exact_voiceover: true,
      segments: cleaned,
    };
  }

  function parseTimedScriptMarkdown(text) {
    const errors = [];
    let header = null;
    const rawSegments = [];
    let sawRow = false;
    String(text || "").split(/\r?\n/).forEach((line, offset) => {
      const lineNumber = offset + 1;
      if (!String(line).trim()) return;
      const row = cells(line);
      if (!row.length) return;
      if (isSeparator(row)) return;
      if (!header && headerIndexes(row)) {
        header = headerIndexes(row);
        return;
      }
      sawRow = true;
      const indexes = header || { time: 0, voiceover: 1, visual: 2 };
      if (row.length <= indexes.time) {
        errors.push(`Line ${lineNumber}: could not read a time range.`);
        return;
      }
      const parsed = parseTimeRange(row[indexes.time]);
      if (!parsed) {
        errors.push(`Line ${lineNumber}: invalid timestamp '${row[indexes.time]}'. Use 0:00–0:07.`);
        return;
      }
      rawSegments.push({
        start_seconds: parsed[0],
        end_seconds: parsed[1],
        voiceover_text: row.length > indexes.voiceover ? stripWrappingQuotes(row[indexes.voiceover]) : "",
        suggested_visual: row.length > indexes.visual ? row[indexes.visual].trim() : "",
        asset_id: "",
        speech_rate: 1,
      });
    });
    if (!sawRow && !rawSegments.length) {
      errors.push("No timed-script rows found. Paste a Markdown table or a spreadsheet copy with Time, Voiceover, and Suggested still.");
    }
    const timeline = rawSegments.length ? buildTimeline(rawSegments) : null;
    const issues = timeline ? validateTimeline(timeline.segments) : [];
    return {
      ok: !errors.length && !issues.length && Boolean(timeline && timeline.segments.length),
      errors,
      issues,
      timeline,
    };
  }

  function parseJsonObject(text) {
    const payload = String(text || "").trim();
    const start = payload.indexOf("{");
    if (start < 0) return null;
    const body = payload.slice(start);
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(body.slice(0, i + 1)); } catch { return null; }
        }
      }
    }
    return null;
  }

  function normalizeTimeline(raw) {
    let value = raw;
    if (typeof value === "string") {
      value = parseJsonObject(value);
      if (!value) return null;
    }
    if (!value || typeof value !== "object" || !Array.isArray(value.segments) || !value.segments.length) return null;
    const timeline = buildTimeline(value.segments);
    return timeline.segments.length ? timeline : null;
  }

  function exactVoiceoverText(timeline) {
    if (!timeline || !Array.isArray(timeline.segments)) return "";
    return timeline.segments.map((segment) => String(segment.voiceover_text || "").trim()).filter(Boolean).join(" ").trim();
  }

  function stillNameKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function assetId(asset) {
    return String(asset?.id || asset?.media_asset_record_id || "").trim();
  }

  function assetName(asset) {
    return String(asset?.name || asset?.filename || asset?.caption || "").trim();
  }

  function matchStillsBySuggestedName(timeline, assets) {
    const normalized = normalizeTimeline(timeline);
    if (!normalized) return timeline;
    const ordered = (Array.isArray(assets) ? assets : [])
      .filter((asset) => asset && typeof asset === "object")
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const used = new Set();
    normalized.segments.forEach((segment) => {
      const visual = stillNameKey(segment.suggested_visual);
      if (!visual) return;
      const exact = ordered.find((asset) => !used.has(assetId(asset)) && stillNameKey(assetName(asset)) === visual);
      let match = exact || null;
      if (!match) {
        const contains = ordered.filter((asset) => {
          const name = stillNameKey(assetName(asset));
          return name && !used.has(assetId(asset)) && (name.includes(visual) || visual.includes(name)) && Math.min(name.length, visual.length) >= 8;
        });
        if (contains.length === 1) match = contains[0];
      }
      if (!match) return;
      const id = assetId(match);
      if (!id) return;
      segment.asset_id = id;
      used.add(id);
    });
    return normalized;
  }

  function assignStillsInOrder(timeline, assets) {
    const named = matchStillsBySuggestedName(timeline, assets);
    const normalized = normalizeTimeline(named) || named;
    if (!normalized || !Array.isArray(normalized.segments)) return timeline;
    const ordered = (Array.isArray(assets) ? assets : [])
      .filter((asset) => asset && typeof asset === "object")
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const knownIds = new Set(ordered.map((asset) => assetId(asset)).filter(Boolean));
    normalized.segments.forEach((segment) => {
      if (segment.asset_id && !knownIds.has(segment.asset_id)) segment.asset_id = "";
    });
    const used = new Set(normalized.segments.map((segment) => String(segment.asset_id || "").trim()).filter(Boolean));
    const remaining = ordered.filter((asset) => assetId(asset) && !used.has(assetId(asset)));
    const unresolved = normalized.segments.filter((segment) => !String(segment.asset_id || "").trim());
    let reuse = 0;
    unresolved.forEach((segment) => {
      let fill = remaining.shift();
      if (!fill && ordered.length) {
        fill = ordered[reuse % ordered.length];
        reuse += 1;
      }
      if (!fill) return;
      segment.asset_id = assetId(fill);
    });
    return normalized;
  }

  function slightSpeechRate(segment) {
    const duration = Number(segment?.duration_seconds) || 0;
    const estimate = estimateNarrationSeconds(segment?.voiceover_text, 1);
    if (duration <= 0 || estimate <= duration + BOUNDARY_EPSILON_SECONDS) return 1;
    return roundSeconds(Math.min(MAX_SLIGHT_SPEECH_RATE, Math.max(1, estimate / duration)));
  }

  function directiveLine(timeline) {
    const normalized = normalizeTimeline(timeline);
    if (!normalized) return "";
    return "[timed-script] " + JSON.stringify(normalized);
  }

  function reindex(timeline) {
    return buildTimeline(timeline?.segments || []);
  }

  return {
    assignStillsInOrder,
    buildTimeline,
    directiveLine,
    estimateNarrationSeconds,
    exactVoiceoverText,
    formatClock,
    matchStillsBySuggestedName,
    narrationFit,
    normalizeTimeline,
    parseClock,
    parseTimedScriptMarkdown,
    parseTimeRange,
    reindex,
    segmentDurationFrames,
    slightSpeechRate,
    validateTimeline,
  };
});
