/**
 * Vibe Cut — music-driven montage mode.
 *
 * Music → beat map → clip selection → trim points → visual effects.
 * No voiceover / narration. Distinct from Standard stills and timed-script Timeline.
 *
 * Config lives on Production_Notes as:
 *   origin=ez-wizard; ez-input=vibe-cut; ez-caption=ai; ez-package=video
 *   [vibe-cut] {JSON}
 */

export const VIBE_CUT_INPUT = "vibe-cut";
export const VIBE_CUT_SCHEMA_VERSION = "vibe-cut.1";

export const VIBE_CUT_STYLES = Object.freeze({
  SMOOTH_VIBES: "smooth-vibes",
  BEAT_CUT: "beat-cut",
  FAST_CUTS: "fast-cuts",
});

export const VIBE_CUT_STYLE_LABELS = Object.freeze({
  [VIBE_CUT_STYLES.SMOOTH_VIBES]: "Smooth Vibes",
  [VIBE_CUT_STYLES.BEAT_CUT]: "Beat Cut",
  [VIBE_CUT_STYLES.FAST_CUTS]: "Fast Cuts",
});

export const VIBE_CUT_CHRONOLOGY = Object.freeze({
  CHRONOLOGICAL: "chronological",
  BEST_MOMENTS: "best-moments",
});

export const VIBE_CUT_TARGET_PRESETS = Object.freeze([15, 30, 45]);

/** Style defaults before Energy (1–5) adjusts them. */
const STYLE_BASE = Object.freeze({
  [VIBE_CUT_STYLES.SMOOTH_VIBES]: Object.freeze({
    minClip: 2.4,
    maxClip: 4.2,
    preferredClip: 3.4,
    beatSnap: "soft",
    speedRampChance: 0.05,
    punchInChance: 0.12,
    hardCutBias: 0.7,
    defaultEnergy: 2,
    pacing: "slow",
    preset: "cinematic",
  }),
  [VIBE_CUT_STYLES.BEAT_CUT]: Object.freeze({
    minClip: 0.7,
    maxClip: 2.4,
    preferredClip: 1.4,
    beatSnap: "strong",
    speedRampChance: 0.12,
    punchInChance: 0.22,
    hardCutBias: 0.95,
    defaultEnergy: 3,
    pacing: "normal",
    preset: "energetic",
  }),
  [VIBE_CUT_STYLES.FAST_CUTS]: Object.freeze({
    minClip: 0.45,
    maxClip: 1.6,
    preferredClip: 0.85,
    beatSnap: "aggressive",
    speedRampChance: 0.35,
    punchInChance: 0.4,
    hardCutBias: 1,
    defaultEnergy: 5,
    pacing: "fast",
    preset: "energetic",
  }),
});

export function normalizeVibeCutStyle(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (raw === "smooth" || raw === "smooth-vibes" || raw === "smooth_vibes") {
    return VIBE_CUT_STYLES.SMOOTH_VIBES;
  }
  if (raw === "fast" || raw === "fast-cuts" || raw === "fast_cuts") {
    return VIBE_CUT_STYLES.FAST_CUTS;
  }
  return VIBE_CUT_STYLES.BEAT_CUT;
}

export function normalizeVibeCutEnergy(value, style = VIBE_CUT_STYLES.BEAT_CUT) {
  const n = Math.round(Number(value));
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return STYLE_BASE[normalizeVibeCutStyle(style)]?.defaultEnergy || 3;
}

export function normalizeVibeCutChronology(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (raw === "chronological" || raw === "chrono" || raw === "in-order") {
    return VIBE_CUT_CHRONOLOGY.CHRONOLOGICAL;
  }
  return VIBE_CUT_CHRONOLOGY.BEST_MOMENTS;
}

export function normalizeVibeCutTargetSeconds(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 30;
  return Math.min(90, Math.max(8, n));
}

export function normalizeVibeCutVersions(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

export function vibeCutStyleParams(style, energy) {
  const normalizedStyle = normalizeVibeCutStyle(style);
  const base = STYLE_BASE[normalizedStyle] || STYLE_BASE[VIBE_CUT_STYLES.BEAT_CUT];
  const e = normalizeVibeCutEnergy(energy, normalizedStyle);
  // Energy stretches toward shorter clips / more effects as it rises.
  const t = (e - 1) / 4;
  const shorten = 1 - t * 0.45;
  const lengthen = 1 + (1 - t) * 0.15;
  return {
    style: normalizedStyle,
    energy: e,
    minClip: Math.max(0.35, +(base.minClip * shorten).toFixed(3)),
    maxClip: Math.max(0.6, +(base.maxClip * (t > 0.5 ? shorten : lengthen)).toFixed(3)),
    preferredClip: Math.max(0.4, +(base.preferredClip * shorten).toFixed(3)),
    beatSnap: base.beatSnap,
    speedRampChance: Math.min(0.7, +(base.speedRampChance + t * 0.25).toFixed(3)),
    punchInChance: Math.min(0.7, +(base.punchInChance + t * 0.2).toFixed(3)),
    hardCutBias: base.hardCutBias,
    pacing: base.pacing,
    preset: base.preset,
    defaultEnergy: base.defaultEnergy,
  };
}

export function defaultVibeCutConfig(partial = {}) {
  const style = normalizeVibeCutStyle(partial.style || partial.editing_style);
  const energy = normalizeVibeCutEnergy(partial.energy ?? partial.energy_level, style);
  const params = vibeCutStyleParams(style, energy);
  return {
    schema_version: VIBE_CUT_SCHEMA_VERSION,
    mode: "vibe_cut",
    style,
    energy,
    target_seconds: normalizeVibeCutTargetSeconds(partial.target_seconds ?? partial.targetSeconds ?? 30),
    chronology: normalizeVibeCutChronology(partial.chronology || partial.order),
    beat_sync: String(partial.beat_sync ?? partial.beatSync ?? "on").toLowerCase() === "off" ? "off" : "on",
    versions: normalizeVibeCutVersions(partial.versions ?? partial.version_count ?? 1),
    prefer_unused: Boolean(partial.prefer_unused ?? partial.preferUnused ?? partial.unused_prefer),
    find_best: Boolean(partial.find_best ?? partial.findBest),
    aspect_ratio: String(partial.aspect_ratio || partial.aspectRatio || "9:16").trim() || "9:16",
    voiceover: "off",
    params,
  };
}

export function parseVibeCutDirective(notes) {
  const match = /(?:^|\n)\[vibe-cut\]\s*(\{[\s\S]*?\})\s*(?:\n|$)/i.exec(String(notes || ""));
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return defaultVibeCutConfig(parsed);
  } catch {
    return null;
  }
}

export function formatVibeCutDirective(config) {
  const normalized = defaultVibeCutConfig(config || {});
  const payload = {
    schema_version: normalized.schema_version,
    mode: "vibe_cut",
    style: normalized.style,
    energy: normalized.energy,
    target_seconds: normalized.target_seconds,
    chronology: normalized.chronology,
    beat_sync: normalized.beat_sync,
    versions: normalized.versions,
    prefer_unused: normalized.prefer_unused,
    find_best: normalized.find_best,
    aspect_ratio: normalized.aspect_ratio,
    voiceover: "off",
  };
  if (Array.isArray(config?.cuts) && config.cuts.length) payload.cuts = config.cuts;
  if (Array.isArray(config?.used_ranges) && config.used_ranges.length) {
    payload.used_ranges = config.used_ranges;
  }
  if (config?.source_media_asset_id) {
    payload.source_media_asset_id = String(config.source_media_asset_id).trim();
  }
  if (config?.theme) payload.theme = String(config.theme).trim();
  return `[vibe-cut] ${JSON.stringify(payload)}`;
}

export function stripVibeCutDirective(notes) {
  return String(notes || "")
    .replace(/(?:^|\n)\[vibe-cut\]\s*[^\n]*(?=\n|$)/gi, "")
    .replace(/^\s*\n/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mergeVibeCutDirective(notes, config) {
  const cleaned = stripVibeCutDirective(notes);
  const line = formatVibeCutDirective(config);
  return cleaned ? `${line}\n${cleaned}` : line;
}

export function isVibeCutNotes(notes) {
  const text = String(notes || "");
  if (/ez-input=vibe-cut/i.test(text)) return true;
  return Boolean(parseVibeCutDirective(text));
}

export function vibeCutOriginNotes({
  origin = "ez-wizard",
  captionMode = "ai",
  packageId = "video",
  config,
} = {}) {
  const parts = [
    `origin=${String(origin || "ez-wizard").trim() || "ez-wizard"}`,
    `ez-input=${VIBE_CUT_INPUT}`,
    `ez-caption=${String(captionMode || "ai").trim().toLowerCase() || "ai"}`,
    `ez-package=${String(packageId || "video").trim().toLowerCase() || "video"}`,
  ];
  const base = parts.join("; ");
  if (!config) return base;
  return mergeVibeCutDirective(base, config);
}

export function vibeCutRenderSettings(config) {
  const normalized = defaultVibeCutConfig(config || {});
  const params = vibeCutStyleParams(normalized.style, normalized.energy);
  return {
    preset: params.preset,
    motion: "auto",
    transition: "cut",
    transition_seconds: "0",
    duration_mode: "auto",
    duration_seconds: String(params.preferredClip),
    intensity: normalized.energy >= 4 ? "high" : (normalized.energy <= 2 ? "low" : "normal"),
    pacing: params.pacing,
    fit: "smart_crop",
    beat_sync: normalized.beat_sync === "off" ? "off" : "on",
    ai_motion: "on",
  };
}

export function formatVibeCutRenderSettings(config) {
  const settings = vibeCutRenderSettings(config);
  return `[render-settings] ${Object.entries(settings)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ")}`;
}

export function mergeVibeCutIntoNotes(notes, config) {
  let next = stripVibeCutDirective(notes);
  next = String(next || "")
    .replace(/(?:^|\n)\[render-settings\]\s*[^\n]*(?=\n|$)/gi, "")
    .replace(/^\s*\n/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Ensure origin stamp includes vibe-cut input.
  if (!/ez-input=vibe-cut/i.test(next)) {
    if (/ez-input=[a-z0-9-]+/i.test(next)) {
      next = next.replace(/ez-input=[a-z0-9-]+/i, `ez-input=${VIBE_CUT_INPUT}`);
    } else if (/origin=/i.test(next)) {
      next = next.replace(/(origin=[^;\n]+)/i, `$1; ez-input=${VIBE_CUT_INPUT}`);
    } else {
      next = vibeCutOriginNotes({ config: null }) + (next ? `\n${next}` : "");
    }
  }
  if (!/ez-package=/i.test(next)) {
    next = next.replace(/(ez-input=vibe-cut)/i, "$1; ez-package=video");
  }
  const blocks = [
    formatVibeCutDirective(config),
    formatVibeCutRenderSettings(config),
  ];
  return [...blocks, next].filter(Boolean).join("\n");
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function overlapSeconds(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function selectOverlapsUsed(select, usedRanges = []) {
  const start = Number(select.start_seconds ?? select.startSeconds ?? 0);
  const end = Number(select.end_seconds ?? select.endSeconds ?? start);
  let used = 0;
  for (const range of usedRanges || []) {
    const rs = Number(range.start_seconds ?? range.startSeconds ?? range[0] ?? 0);
    const re = Number(range.end_seconds ?? range.endSeconds ?? range[1] ?? rs);
    used += overlapSeconds(start, end, rs, re);
  }
  return used;
}

/**
 * Score a candidate select. Higher is better.
 * Accepts optional analysis fields; missing fields fall back gracefully.
 */
export function scoreVibeSelect(select, { usedRanges = [], preferUnused = false } = {}) {
  const start = Number(select.start_seconds ?? select.startSeconds ?? 0);
  const end = Number(select.end_seconds ?? select.endSeconds ?? start);
  const duration = Math.max(0.1, end - start || Number(select.duration_seconds) || 1);
  let score = Number(select.score);
  if (!Number.isFinite(score)) {
    const composition = Number(select.composition ?? select.composition_score ?? 0.55);
    const motion = Number(select.motion ?? select.motion_score ?? 0.4);
    const subject = Number(select.subject ?? select.subject_score ?? 0.5);
    const sharpness = Number(select.sharpness ?? select.sharpness_score ?? 0.6);
    const blurPenalty = Number(select.blur ?? select.blur_score ?? 0);
    const deadPenalty = Number(select.dead_time ?? select.deadTime ?? 0);
    score = (
      composition * 0.28
      + motion * 0.22
      + subject * 0.22
      + sharpness * 0.18
      - blurPenalty * 0.25
      - deadPenalty * 0.3
    );
  }
  // Mild preference for usable durations near 1–4s.
  if (duration >= 0.6 && duration <= 5) score += 0.05;
  if (preferUnused) {
    const used = selectOverlapsUsed({ start_seconds: start, end_seconds: end }, usedRanges);
    const ratio = used / duration;
    score -= ratio * 0.85;
    if (used <= 0.05) score += 0.12;
  }
  return +score.toFixed(4);
}

export function rankVibeSelects(selects, {
  chronology = VIBE_CUT_CHRONOLOGY.BEST_MOMENTS,
  usedRanges = [],
  preferUnused = false,
} = {}) {
  const rows = (Array.isArray(selects) ? selects : [])
    .map((row, index) => {
      const start = Number(row.start_seconds ?? row.startSeconds ?? 0);
      const end = Number(row.end_seconds ?? row.endSeconds ?? (start + (Number(row.duration_seconds) || 1)));
      const duration = Math.max(0.2, end - start);
      const motion = Number(row.motion ?? row.motion_score ?? 0.4);
      return {
        ...row,
        index,
        id: String(row.id || `select-${index + 1}`),
        start_seconds: +start.toFixed(3),
        end_seconds: +(start + duration).toFixed(3),
        duration_seconds: +duration.toFixed(3),
        motion_score: motion,
        score: scoreVibeSelect(
          { ...row, start_seconds: start, end_seconds: start + duration },
          { usedRanges, preferUnused },
        ),
      };
    })
    .filter((row) => row.duration_seconds >= 0.2);

  if (normalizeVibeCutChronology(chronology) === VIBE_CUT_CHRONOLOGY.CHRONOLOGICAL) {
    return rows.sort((a, b) => a.start_seconds - b.start_seconds || b.score - a.score);
  }
  return rows.sort((a, b) => b.score - a.score || a.start_seconds - b.start_seconds);
}

function nearestBeat(seconds, beats, strengths = []) {
  if (!beats?.length) return { beat: seconds, strength: 0.5, delta: 0 };
  let best = beats[0];
  let bestDelta = Math.abs(beats[0] - seconds);
  let bestIdx = 0;
  for (let i = 1; i < beats.length; i++) {
    const delta = Math.abs(beats[i] - seconds);
    if (delta < bestDelta) {
      best = beats[i];
      bestDelta = delta;
      bestIdx = i;
    }
  }
  const strength = Number(strengths[bestIdx]);
  return {
    beat: best,
    strength: Number.isFinite(strength) ? strength : 0.5,
    delta: bestDelta,
  };
}

function clipDurationForSelect(select, params, beatGap) {
  const motion = Number(select.motion_score ?? select.motion ?? 0.4);
  // Calm / low-motion → longer holds; high motion → shorter cuts.
  const calm = clamp(1 - motion, 0, 1);
  let duration = params.preferredClip + calm * (params.maxClip - params.preferredClip);
  duration -= motion * (params.preferredClip - params.minClip) * 0.55;
  if (Number.isFinite(beatGap) && beatGap > 0) {
    // Prefer an integer number of beat gaps inside [min, max].
    const beats = clamp(Math.round(duration / beatGap), 1, 8);
    duration = clamp(beats * beatGap, params.minClip, params.maxClip);
  }
  const available = Number(select.duration_seconds) || duration;
  return +clamp(Math.min(duration, available), params.minClip, Math.min(params.maxClip, available)).toFixed(3);
}

function assignMotionTreatment(select, params, rng) {
  const motion = Number(select.motion_score ?? select.motion ?? 0.4);
  const treatments = [];
  // Strong camera motion → leave alone; static → subtle punch-in / speed.
  if (motion < 0.35 && rng() < params.punchInChance) treatments.push("punch_in");
  if (motion < 0.45 && rng() < params.speedRampChance) treatments.push("speed_ramp");
  if (motion < 0.25) treatments.push("stabilize_reframe");
  if (!treatments.length) treatments.push("none");
  return {
    treatments,
    transition: params.hardCutBias >= 0.9 || rng() < params.hardCutBias ? "cut" : "soft_cut",
    ai_motion: motion < 0.4 ? "on" : "off",
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(parts) {
  const text = parts.map((part) => String(part ?? "")).join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inferTheme(selects) {
  const tags = [];
  for (const row of selects || []) {
    for (const key of ["theme", "label", "tags", "subjects"]) {
      const value = row[key];
      if (Array.isArray(value)) tags.push(...value.map(String));
      else if (value) tags.push(String(value));
    }
  }
  const joined = tags.join(" ").toLowerCase();
  if (/skyline|architecture|building|bridge/.test(joined)) return "Architecture / skyline / street movement";
  if (/people|crowd|traffic|street/.test(joined)) return "People / traffic / street-level activity";
  if (/beach|ocean|water|river|sunset|night/.test(joined)) return "Scenic / atmosphere";
  return "Full cinematic montage";
}

/**
 * Build one music-driven edit from ranked selects + beat map.
 */
export function buildVibeCutEdit({
  selects = [],
  beats = [],
  beatStrengths = [],
  sections = [],
  config = {},
  versionIndex = 0,
  usedRanges = [],
  seed,
} = {}) {
  const normalized = defaultVibeCutConfig(config);
  const params = vibeCutStyleParams(normalized.style, normalized.energy);
  const preferUnused = normalized.prefer_unused || versionIndex > 0;
  const ranked = rankVibeSelects(selects, {
    chronology: normalized.chronology,
    usedRanges,
    preferUnused,
  });
  const rng = mulberry32(seed ?? hashSeed([
    normalized.style,
    normalized.energy,
    normalized.target_seconds,
    versionIndex,
    ranked.map((row) => row.id).join(","),
  ]));

  const beatsInWindow = (Array.isArray(beats) ? beats : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const strengths = Array.isArray(beatStrengths) ? beatStrengths : [];
  const medianGap = (() => {
    if (beatsInWindow.length < 2) return params.preferredClip;
    const gaps = [];
    for (let i = 1; i < beatsInWindow.length; i++) gaps.push(beatsInWindow[i] - beatsInWindow[i - 1]);
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || params.preferredClip;
  })();

  // Save a strong shot for the biggest energy section / drop when available.
  const dropAt = (() => {
    const drop = (Array.isArray(sections) ? sections : []).find((section) => {
      const label = String(section.label || section.name || section.type || "").toLowerCase();
      return /drop|chorus|peak|energy/.test(label);
    });
    if (drop) return Number(drop.start_seconds ?? drop.startSeconds ?? drop.at ?? NaN);
    if (!beatsInWindow.length) return normalized.target_seconds * 0.55;
    // Fallback: strongest beat in the second half of the target window.
    let best = beatsInWindow[Math.floor(beatsInWindow.length * 0.55)] || 0;
    let bestStrength = -1;
    for (let i = 0; i < beatsInWindow.length; i++) {
      const t = beatsInWindow[i];
      if (t < normalized.target_seconds * 0.35 || t > normalized.target_seconds * 0.85) continue;
      const s = Number(strengths[i]);
      const strength = Number.isFinite(s) ? s : 0.5;
      if (strength > bestStrength) {
        bestStrength = strength;
        best = t;
      }
    }
    return best;
  })();

  const hero = ranked[0] || null;
  const pool = ranked.slice();
  const clips = [];
  const consumed = [];
  let cursor = 0;
  let heroPlaced = false;

  while (cursor < normalized.target_seconds - 0.35 && pool.length) {
    const remaining = normalized.target_seconds - cursor;
    let pickIndex = 0;
    // Near the drop, force the hero select if still available.
    if (!heroPlaced && hero && cursor + params.preferredClip >= dropAt - 0.4) {
      const heroIdx = pool.findIndex((row) => row.id === hero.id);
      if (heroIdx >= 0) pickIndex = heroIdx;
    } else if (normalized.chronology === VIBE_CUT_CHRONOLOGY.BEST_MOMENTS) {
      // Soft shuffle among the top remaining so versions diverge.
      const top = Math.min(4, pool.length);
      pickIndex = Math.floor(rng() * top);
    }

    const select = pool.splice(pickIndex, 1)[0];
    if (select.id === hero?.id) heroPlaced = true;

    let duration = clipDurationForSelect(select, params, medianGap);
    duration = Math.min(duration, remaining, select.duration_seconds);
    if (duration < Math.min(0.4, params.minClip)) break;

    // Snap cut point to a nearby beat when beat sync is on.
    let timelineStart = cursor;
    let timelineEnd = cursor + duration;
    if (normalized.beat_sync !== "off" && beatsInWindow.length) {
      const startSnap = nearestBeat(timelineStart, beatsInWindow, strengths);
      const endSnap = nearestBeat(timelineEnd, beatsInWindow, strengths);
      const snapWindow = params.beatSnap === "aggressive" ? 0.22 : (params.beatSnap === "soft" ? 0.12 : 0.18);
      if (startSnap.delta <= snapWindow && startSnap.beat >= cursor - 0.05) {
        timelineStart = Math.max(cursor, startSnap.beat);
      }
      if (endSnap.delta <= snapWindow && endSnap.beat > timelineStart + params.minClip * 0.8) {
        timelineEnd = Math.min(normalized.target_seconds, endSnap.beat);
      }
      duration = +(timelineEnd - timelineStart).toFixed(3);
    }

    // Source trim: for best-moments, bias toward the scored peak inside the select.
    const peak = Number(select.peak_seconds ?? select.peakSeconds);
    let sourceStart = select.start_seconds;
    if (Number.isFinite(peak) && select.duration_seconds > duration) {
      sourceStart = clamp(peak - duration / 2, select.start_seconds, select.end_seconds - duration);
    } else if (select.duration_seconds > duration) {
      sourceStart = select.start_seconds + (select.duration_seconds - duration) * 0.2;
    }
    const sourceEnd = sourceStart + duration;
    const treatment = assignMotionTreatment(select, params, rng);

    clips.push({
      index: clips.length + 1,
      select_id: select.id,
      theme: select.theme || select.label || "",
      timeline_start_seconds: +timelineStart.toFixed(3),
      timeline_end_seconds: +(timelineStart + duration).toFixed(3),
      duration_seconds: +duration.toFixed(3),
      source_start_seconds: +sourceStart.toFixed(3),
      source_end_seconds: +sourceEnd.toFixed(3),
      score: select.score,
      motion_score: select.motion_score,
      transition: treatment.transition,
      treatments: treatment.treatments,
      ai_motion: treatment.ai_motion,
      beat_sync: normalized.beat_sync !== "off",
    });
    consumed.push({
      start_seconds: +sourceStart.toFixed(3),
      end_seconds: +sourceEnd.toFixed(3),
    });
    cursor = timelineStart + duration;
  }

  const durationSeconds = clips.length
    ? clips[clips.length - 1].timeline_end_seconds
    : 0;

  return {
    schema_version: VIBE_CUT_SCHEMA_VERSION,
    mode: "vibe_cut",
    version_index: versionIndex,
    label: `Vibe Cut ${versionIndex + 1}`,
    theme: inferTheme(clips.length ? clips : ranked.slice(0, 6)),
    style: normalized.style,
    style_label: VIBE_CUT_STYLE_LABELS[normalized.style] || "Beat Cut",
    energy: normalized.energy,
    chronology: normalized.chronology,
    beat_sync: normalized.beat_sync,
    target_seconds: normalized.target_seconds,
    duration_seconds: +durationSeconds.toFixed(3),
    clip_count: clips.length,
    drop_at_seconds: Number.isFinite(dropAt) ? +Number(dropAt).toFixed(3) : null,
    clips,
    used_ranges: consumed,
    params,
  };
}

/**
 * Propose one or more vibe cuts from the same source selects + music analysis.
 * Later versions deliberately prefer unused footage.
 */
export function proposeVibeCuts({
  selects = [],
  beats = [],
  beatStrengths = [],
  sections = [],
  config = {},
} = {}) {
  const normalized = defaultVibeCutConfig(config);
  const versions = normalized.versions;
  const cuts = [];
  let usedRanges = Array.isArray(normalized.used_ranges)
    ? [...normalized.used_ranges]
    : (Array.isArray(config.used_ranges) ? [...config.used_ranges] : []);

  for (let i = 0; i < versions; i++) {
    const edit = buildVibeCutEdit({
      selects,
      beats,
      beatStrengths,
      sections,
      config: {
        ...normalized,
        prefer_unused: normalized.prefer_unused || i > 0,
      },
      versionIndex: i,
      usedRanges,
    });
    cuts.push(edit);
    usedRanges = [...usedRanges, ...(edit.used_ranges || [])];
  }

  return {
    schema_version: VIBE_CUT_SCHEMA_VERSION,
    mode: "vibe_cut",
    config: normalized,
    cut_count: cuts.length,
    cuts,
    used_ranges: usedRanges,
    actions: ["keep", "regenerate", "create_another_from_unused"],
  };
}

/**
 * Build evenly-spaced provisional selects when real analysis is not ready yet.
 * Pipeline scene detection should replace these before final render.
 */
export function provisionalSelectsFromDuration(durationSeconds, {
  count = 16,
  windowSeconds = 2.5,
} = {}) {
  const duration = Math.max(1, Number(durationSeconds) || 0);
  const n = Math.min(40, Math.max(6, Math.round(Number(count) || 16)));
  const window = Math.min(4, Math.max(1, Number(windowSeconds) || 2.5));
  const selects = [];
  for (let i = 0; i < n; i++) {
    const center = ((i + 0.5) / n) * duration;
    const start = clamp(center - window / 2, 0, Math.max(0, duration - 0.4));
    const end = clamp(start + window, start + 0.4, duration);
    selects.push({
      id: `provisional-${i + 1}`,
      start_seconds: +start.toFixed(3),
      end_seconds: +end.toFixed(3),
      duration_seconds: +(end - start).toFixed(3),
      peak_seconds: +center.toFixed(3),
      score: 0.45 + ((i % 5) * 0.04),
      motion_score: 0.3 + ((i % 3) * 0.15),
      composition_score: 0.5,
      provisional: true,
    });
  }
  return selects;
}

/** Turn scene-change timestamps into candidate selects. */
export function selectsFromSceneTimestamps(sceneSeconds, durationSeconds, {
  padBefore = 0.15,
  padAfter = 1.8,
} = {}) {
  const duration = Math.max(0.5, Number(durationSeconds) || 0);
  const stamps = (Array.isArray(sceneSeconds) ? sceneSeconds : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < duration)
    .sort((a, b) => a - b);
  if (!stamps.length) return provisionalSelectsFromDuration(duration);
  const boundaries = [0, ...stamps, duration];
  const selects = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const rawStart = boundaries[i];
    const rawEnd = boundaries[i + 1];
    if (rawEnd - rawStart < 0.35) continue;
    const start = clamp(rawStart + (i === 0 ? 0 : padBefore), 0, duration);
    const end = clamp(Math.min(rawEnd, start + padAfter + (rawEnd - rawStart) * 0.35), start + 0.35, duration);
    selects.push({
      id: `scene-${selects.length + 1}`,
      start_seconds: +start.toFixed(3),
      end_seconds: +end.toFixed(3),
      duration_seconds: +(end - start).toFixed(3),
      peak_seconds: +((start + end) / 2).toFixed(3),
      score: 0.5,
      motion_score: 0.45,
    });
  }
  return selects.length ? selects : provisionalSelectsFromDuration(duration);
}

export function anotherCutFromUnused({
  selects = [],
  beats = [],
  beatStrengths = [],
  sections = [],
  config = {},
  usedRanges = [],
} = {}) {
  return buildVibeCutEdit({
    selects,
    beats,
    beatStrengths,
    sections,
    config: {
      ...defaultVibeCutConfig(config),
      prefer_unused: true,
      versions: 1,
    },
    versionIndex: Array.isArray(usedRanges) ? usedRanges.length : 1,
    usedRanges,
  });
}

export function vibeCutProductionDefaults(config) {
  const normalized = defaultVibeCutConfig(config || {});
  return {
    content_type: "Vertical Short Video",
    voiceover_mode: "No",
    background_music_mode: "Yes",
    thumbnail_mode: "Yes",
    video_duration_seconds: normalized.target_seconds,
    voiceover_duration_seconds: "",
    script_mode: "Leave blank",
    requested_script: "",
  };
}
