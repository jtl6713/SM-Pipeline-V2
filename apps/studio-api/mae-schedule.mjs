/** Strict MAE-first, balanced-overflow scheduling in profile-local time.
 *
 * Primary pass (MAE first): fill Morning → Afternoon → Evening on Day 1,
 * then Day 2, and so on through the configured horizon (default 30 days).
 * Skip occupied or past windows; never overwrite existing reservations.
 *
 * Secondary pass (balanced overflow): once every available MAE slot in the
 * horizon is taken, place one extra post on the least-populated eligible day
 * (earliest day wins ties) in that day's widest valid publishing gap. Repeat
 * Day 1 → Day X until capacity is exhausted.
 *
 * Lanes are independent per profile × platform × output type. Stories do not
 * share a lane with Reels (or any other type). Two types may share a wall-clock
 * time because their schedules are independent.
 *
 * Overnight blackout: 8:00 PM through 3:30 AM profile-local (inclusive).
 */

/** Minimum separation between posts in the same lane (profile/platform/output).
 * 90 minutes leaves room for overflow midpoints between MAE windows under the
 * 8:00 PM blackout (5:00 / 10:30 / 16:00 are only 5.5h apart). */
export const MAE_SCHEDULE_GAP_MS = 90 * 60 * 1000;
export const MAE_SUGGEST_HORIZON_DAYS = 30;
export const MAE_PRIORITY_SCHEDULE_WINDOWS = Object.freeze([
  "05:00-07:00",
  "10:30-12:30",
  "16:00-18:00",
]);
export const MAE_SUGGEST_LEAD_MS = 10 * 60 * 1000;
/** Companion Stories sit this far after the same-platform main when MAE has no open slot. */
export const MAE_STORY_COMPANION_OFFSET_MS = 10 * 60 * 1000;
export const MAE_DEFAULT_TIME_ZONE = "America/Chicago";
/** Inclusive local blackout: 8:00 PM through 3:30 AM profile time. */
export const MAE_SCHEDULE_BLACKOUT_START_MINUTES = 20 * 60;
export const MAE_SCHEDULE_BLACKOUT_END_MINUTES = 3 * 60 + 30;
/** First allowed minute after overnight blackout (3:31 AM). */
export const MAE_SCHEDULE_OPEN_START_MINUTES = 3 * 60 + 31;
/** Last allowed minute before overnight blackout (7:59 PM). */
export const MAE_SCHEDULE_OPEN_END_MINUTES = 19 * 60 + 59;
/** Pipeline Settings key for the rolling scheduling horizon. */
export const MAE_SCHEDULE_HORIZON_SETTING = "STUDIO_SCHEDULE_HORIZON_DAYS";
export const MAE_SCHEDULE_HORIZON_MIN = 1;
export const MAE_SCHEDULE_HORIZON_MAX = 90;

export function maeNormalizeHorizonDays(value, fallback = MAE_SUGGEST_HORIZON_DAYS) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.floor(Number(fallback) || MAE_SUGGEST_HORIZON_DAYS);
  return Math.min(MAE_SCHEDULE_HORIZON_MAX, Math.max(MAE_SCHEDULE_HORIZON_MIN, Math.floor(n)));
}

/** Canonical occupancy / schedule lane: platform::outputType (case-folded). */
export function maeScheduleLaneKey(platform, outputType) {
  const p = String(platform || "").trim().toLowerCase();
  const t = String(outputType || "").trim().toLowerCase();
  if (!p) return "";
  if (!t) return p;
  return `${p}::${t}`;
}

export function maeTimeZoneFromTheme(theme) {
  const t = String(theme || "").trim().toLowerCase();
  if (t === "la" || t === "los angeles" || t === "america/los_angeles") return "America/Los_Angeles";
  if (t === "nyc" || t === "new york" || t === "miami" || t === "america/new_york") return "America/New_York";
  if (t === "america/chicago" || t === "chicago") return "America/Chicago";
  return MAE_DEFAULT_TIME_ZONE;
}

export function maeNormalizeTimeZone(value) {
  const zone = String(value || "").trim() || MAE_DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return MAE_DEFAULT_TIME_ZONE;
  }
}

export function maeZonedDateTimeParts(date = new Date(), timeZone = MAE_DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: maeNormalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function maeZonedWallToUtcMs(year, month, day, hour, minute, timeZone = MAE_DEFAULT_TIME_ZONE) {
  const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ms = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: maeNormalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 8; i++) {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    const got = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0, 0);
    const delta = want - got;
    if (delta === 0) return ms;
    ms += delta;
  }
  return ms;
}

export function maeAddCivilDays(year, month, day, delta) {
  const utc = Date.UTC(year, month - 1, day) + delta * 86400000;
  const next = new Date(utc);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function maeCivilKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function maeOccupiedOnDay(occupiedMs, civil, timeZone = MAE_DEFAULT_TIME_ZONE) {
  return (occupiedMs || []).filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    const parts = maeZonedDateTimeParts(new Date(ms), timeZone);
    return maeCivilKey(parts.year, parts.month, parts.day) === civil.key;
  });
}

export function maeFlattenOccupied(occupiedByLane) {
  return Object.values(occupiedByLane || {}).flat().filter((ms) => Number.isFinite(ms));
}

export function maeScheduleConflicts(ms, occupiedMs, gapMs = MAE_SCHEDULE_GAP_MS) {
  if (!Number.isFinite(ms)) return false;
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}

export function maeIsBlackoutLocalTime(ms, timeZone = MAE_DEFAULT_TIME_ZONE) {
  if (!Number.isFinite(ms)) return false;
  const parts = maeZonedDateTimeParts(new Date(ms), timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= MAE_SCHEDULE_BLACKOUT_START_MINUTES || minutes <= MAE_SCHEDULE_BLACKOUT_END_MINUTES;
}

export function maeAllowedMinutes() {
  return MAE_PRIORITY_SCHEDULE_WINDOWS.map((window) => {
    const [start] = String(window).split("-");
    const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
    return hh * 60 + mm;
  });
}

export function maeIsPriorityLocalTime(ms, timeZone = MAE_DEFAULT_TIME_ZONE) {
  if (!Number.isFinite(ms) || maeIsBlackoutLocalTime(ms, timeZone)) return false;
  const parts = maeZonedDateTimeParts(new Date(ms), timeZone);
  return maeAllowedMinutes().includes(parts.hour * 60 + parts.minute);
}

function maeStandardSlotMs(civil, window, timeZone) {
  const [start] = String(window).split("-");
  const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
  return maeZonedWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0, timeZone);
}

function maeCivilWithKey(civil) {
  return { ...civil, key: maeCivilKey(civil.year, civil.month, civil.day) };
}

function maeDayStandardsCovered(civil, nowMs, blockers, timeZone) {
  for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
    const ms = maeStandardSlotMs(civil, window, timeZone);
    if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone)) continue;
    if (!maeScheduleConflicts(ms, blockers)) return false;
  }
  return true;
}

function maeExtraCandidateInGap(left, right, windowStart, windowEnd, nowMs, posts, timeZone, gapMs) {
  const span = right - left;
  if (span <= 0) return null;
  const candidates = [];
  const mid = Math.round((left + Math.round(span / 2)) / 60000) * 60000;
  candidates.push(mid);
  // Also try the earliest and latest valid edges inside the gap.
  const earliest = Math.ceil((left + gapMs) / 60000) * 60000;
  const latest = Math.floor((right - gapMs) / 60000) * 60000;
  if (Number.isFinite(earliest)) candidates.push(earliest);
  if (Number.isFinite(latest)) candidates.push(latest);
  for (let ms = Math.max(windowStart, left); ms <= Math.min(windowEnd, right); ms += 15 * 60 * 1000) {
    candidates.push(ms);
  }
  let chosen = null;
  for (const raw of candidates) {
    const ms = Math.round(raw / 60000) * 60000;
    if (ms < windowStart || ms > windowEnd || ms <= nowMs) continue;
    if (maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, posts, gapMs)) continue;
    if (maeIsPriorityLocalTime(ms, timeZone)) continue;
    if (!chosen || Math.abs(ms - mid) < Math.abs(chosen - mid) || (Math.abs(ms - mid) === Math.abs(chosen - mid) && ms < chosen)) {
      chosen = ms;
    }
  }
  return chosen == null ? null : { ms: chosen, span };
}

function maeExtraIsoOnDay(civil, nowMs, blockers, timeZone, gapMs = MAE_SCHEDULE_GAP_MS) {
  const openStart = maeZonedWallToUtcMs(
    civil.year,
    civil.month,
    civil.day,
    Math.floor(MAE_SCHEDULE_OPEN_START_MINUTES / 60),
    MAE_SCHEDULE_OPEN_START_MINUTES % 60,
    timeZone,
  );
  const openEnd = maeZonedWallToUtcMs(
    civil.year,
    civil.month,
    civil.day,
    Math.floor(MAE_SCHEDULE_OPEN_END_MINUTES / 60),
    MAE_SCHEDULE_OPEN_END_MINUTES % 60,
    timeZone,
  );
  const windowStart = Math.max(openStart, nowMs + 60 * 1000);
  const windowEnd = openEnd;
  if (!(windowStart < windowEnd)) return "";

  const posts = (blockers || []).filter((ms) => Number.isFinite(ms)).slice().sort((a, b) => a - b);
  let before = null;
  let after = null;
  const interior = [];
  for (const post of posts) {
    if (post < windowStart) before = post;
    else if (post > windowEnd) {
      after = post;
      break;
    } else interior.push(post);
  }
  const markers = [before != null ? before : windowStart, ...interior, after != null ? after : windowEnd];
  let best = null;
  for (let i = 0; i < markers.length - 1; i++) {
    const left = markers[i];
    const right = markers[i + 1];
    const candidate = maeExtraCandidateInGap(left, right, windowStart, windowEnd, nowMs, posts, timeZone, gapMs);
    if (!candidate) continue;
    if (!best || candidate.span > best.span || (candidate.span === best.span && candidate.ms < best.ms)) {
      best = candidate;
    }
  }
  return best ? new Date(best.ms).toISOString() : "";
}

function maeBlockingTimes(occupiedMs, laneOccupiedMs) {
  const seen = new Set();
  const out = [];
  for (const ms of [...(occupiedMs || []), ...(laneOccupiedMs || [])]) {
    if (!Number.isFinite(ms) || seen.has(ms)) continue;
    seen.add(ms);
    out.push(ms);
  }
  return out;
}

function maeHorizonCivils(local, horizonDays = MAE_SUGGEST_HORIZON_DAYS) {
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const civil = i === 0
      ? { year: local.year, month: local.month, day: local.day }
      : maeAddCivilDays(local.year, local.month, local.day, i);
    days.push(maeCivilWithKey(civil));
  }
  return days;
}

function maeAvoidCivilKeys(value) {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

function maeWalkCivils(civils, startCivilIndex = 0) {
  if (!civils.length) return [];
  const start = ((Number(startCivilIndex) || 0) % civils.length + civils.length) % civils.length;
  return [...civils.slice(start), ...civils.slice(0, start)];
}

export function maePlatformSpreadStartIndex(platformIndex, platformCount, horizonDays = MAE_SUGGEST_HORIZON_DAYS) {
  const count = Math.max(1, Number(platformCount) || 1);
  const index = Math.max(0, Number(platformIndex) || 0);
  const days = Math.max(1, maeNormalizeHorizonDays(horizonDays));
  if (count <= 1) return 0;
  return Math.floor((index % count) * days / count);
}

function maeOpenMaeSlot(civil, nowMs, blockers, timeZone) {
  for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
    const ms = maeStandardSlotMs(civil, window, timeZone);
    if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, blockers)) continue;
    return new Date(ms).toISOString();
  }
  return "";
}

function maeDayPostCount(civil, times, timeZone) {
  return maeOccupiedOnDay(times, maeCivilWithKey(civil), timeZone).length;
}

/**
 * MAE-first chronological walk, then least-populated-day overflow with widest gap.
 * Returns ISO string or "" on capacity failure.
 */
function maePickFromCivils(civils, nowMs, blockers, timeZone, avoidCivilKeys, laneTimes, gapMs = MAE_SCHEDULE_GAP_MS) {
  const avoid = maeAvoidCivilKeys(avoidCivilKeys);
  const countsFrom = laneTimes || blockers;

  // Primary: Day 1 Morning → Afternoon → Evening, then Day 2, … Day X.
  for (const civil of civils) {
    if (avoid.has(civil.key)) continue;
    const mae = maeOpenMaeSlot(civil, nowMs, blockers, timeZone);
    if (mae) return mae;
  }

  // Overflow: among days whose MAE trio is full, prefer the least-populated
  // eligible day (earliest on ties). Place one post in that day's widest gap.
  let best = null;
  for (const civil of civils) {
    if (avoid.has(civil.key)) continue;
    if (!maeDayStandardsCovered(civil, nowMs, blockers, timeZone)) continue;
    const extra = maeExtraIsoOnDay(civil, nowMs, blockers, timeZone, gapMs);
    if (!extra) continue;
    const count = maeDayPostCount(civil, countsFrom, timeZone);
    if (
      !best
      || count < best.count
      || (count === best.count && Date.parse(extra) < Date.parse(best.iso))
    ) {
      best = { iso: extra, count };
    }
  }
  return best ? best.iso : "";
}

export function maePickBalancedSuggestedIso(_windows, now = new Date(), options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const blockers = maeBlockingTimes(occupiedMs, platformOccupiedMs);
  const nowMs = now.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const local = maeZonedDateTimeParts(now, timeZone);
  const horizonDays = maeNormalizeHorizonDays(options.horizonDays, MAE_SUGGEST_HORIZON_DAYS);
  const civils = maeWalkCivils(maeHorizonCivils(local, horizonDays), options.startCivilIndex);
  const avoid = maeAvoidCivilKeys(options.avoidCivilKeys);
  const gapMs = Number(options.gapMs) > 0 ? Number(options.gapMs) : MAE_SCHEDULE_GAP_MS;

  const spread = maePickFromCivils(civils, nowMs, blockers, timeZone, avoid, platformOccupiedMs, gapMs);
  if (spread) return spread;
  if (avoid.size) return maePickFromCivils(civils, nowMs, blockers, timeZone, new Set(), platformOccupiedMs, gapMs);
  return "";
}

/**
 * Central scheduling engine entry: pick the next publish instant for one lane.
 * Returns { ok, iso, error, capacity }.
 */
export function maeScheduleNextSlot(options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const now = options.now instanceof Date ? options.now : new Date();
  const horizonDays = maeNormalizeHorizonDays(options.horizonDays, MAE_SUGGEST_HORIZON_DAYS);
  const occupiedMs = options.occupiedMs || options.laneOccupiedMs || [];
  const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
    occupiedMs,
    platformOccupiedMs: occupiedMs,
    timeZone,
    horizonDays,
    leadMs: options.leadMs,
    gapMs: options.gapMs,
    startCivilIndex: options.startCivilIndex,
    avoidCivilKeys: options.avoidCivilKeys,
  });
  if (!iso) {
    return {
      ok: false,
      iso: "",
      capacity: true,
      error: `No open morning, afternoon, evening, or overflow slot in the next ${horizonDays} days`,
    };
  }
  return { ok: true, iso, capacity: false, error: "" };
}

export function maeNextOpenScheduleIso(candidateIso, occupiedMs, gapMs = MAE_SCHEDULE_GAP_MS, options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const now = options.now instanceof Date ? options.now : new Date();
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs || [];
  const allOccupiedMs = options.occupiedMs || occupiedMs || [];
  // Approve keeps any future non-blackout time that does not clash. Regeneration
  // still requires an MAE priority slot unless keepAnyNonClashing is set.
  const keepAny = options.keepAnyNonClashing === true;
  const ms = Date.parse(candidateIso);
  if (
    Number.isFinite(ms)
    && ms > now.getTime()
    && !maeIsBlackoutLocalTime(ms, timeZone)
    && !maeScheduleConflicts(ms, platformOccupiedMs, gapMs)
    && (keepAny || maeIsPriorityLocalTime(ms, timeZone))
  ) {
    return new Date(ms).toISOString();
  }
  return maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
    occupiedMs: allOccupiedMs,
    platformOccupiedMs,
    timeZone,
    horizonDays: options.horizonDays,
    leadMs: options.leadMs,
    gapMs,
  });
}

export function maeAdvancePastBlackout(ms, timeZone = MAE_DEFAULT_TIME_ZONE) {
  if (!Number.isFinite(ms)) return ms;
  let cursor = ms;
  // Overnight blackout is 8:00 PM through 3:30 AM. Walk forward at most twelve hours.
  for (let i = 0; i < 12 * 60; i += 1) {
    if (!maeIsBlackoutLocalTime(cursor, timeZone)) return cursor;
    cursor += 60 * 1000;
  }
  return cursor;
}

function maeStoryCompanionIso(stamps, platform, notBeforeMs) {
  const mainKeys = [
    `${platform}::Reel`,
    `${platform}::Carousel`,
    `${platform}::Single Image`,
    `${platform}::Multi-Image Post`,
    `${platform}::Slideshow Reel`,
    `${platform}::Video Draft`,
    `${platform}::Short`,
  ];
  for (const key of mainKeys) {
    const base = Date.parse(String(stamps.get(key) || ""));
    if (!Number.isFinite(base)) continue;
    const companion = base + MAE_STORY_COMPANION_OFFSET_MS;
    if (companion > notBeforeMs) return new Date(companion).toISOString();
  }
  for (const [key, iso] of stamps.entries()) {
    if (/::Story$/i.test(key)) continue;
    const base = Date.parse(String(iso || ""));
    if (!Number.isFinite(base)) continue;
    const companion = base + MAE_STORY_COMPANION_OFFSET_MS;
    if (companion > notBeforeMs) return new Date(companion).toISOString();
  }
  return "";
}

export function maeStoryCompanionIsoFromSiblings(siblings, platform, notBeforeMs = 0) {
  const stamps = new Map();
  for (const row of siblings || []) {
    const name = String(row?.platform || "").trim();
    const outputType = String(row?.output_type || "").trim();
    const iso = String(row?.scheduled_at || "").trim();
    if (!name || !outputType || /story/i.test(outputType)) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    const key = `${name}::${outputType}`;
    if (!stamps.has(key)) stamps.set(key, new Date(ms).toISOString());
  }
  return maeStoryCompanionIso(stamps, platform, notBeforeMs);
}

function maeUsableStoredStoryIso(iso, notBeforeMs, timeZone) {
  const ms = Date.parse(String(iso || "").trim());
  if (!Number.isFinite(ms) || ms <= notBeforeMs) return "";
  if (maeIsBlackoutLocalTime(ms, timeZone)) return "";
  return new Date(ms).toISOString();
}

/** Story publish time. Same-platform main + 10 minutes wins when present.
 * Otherwise Stories use their own independent MAE lane (not a shared platform lane). */
export function maeResolveStorySchedule({
  platform = "",
  siblings = [],
  requestedIso = "",
  existingIso = "",
  notBeforeMs = 0,
  occupiedMaeIso = "",
  timeZone = MAE_DEFAULT_TIME_ZONE,
  allowMaeFallback = true,
} = {}) {
  const zone = maeNormalizeTimeZone(timeZone);
  const companion = maeStoryCompanionIsoFromSiblings(siblings, platform, notBeforeMs);
  if (companion) {
    return {
      iso: new Date(maeAdvancePastBlackout(Date.parse(companion), zone)).toISOString(),
      source: "companion",
    };
  }
  const stored = maeUsableStoredStoryIso(requestedIso, notBeforeMs, zone)
    || maeUsableStoredStoryIso(existingIso, notBeforeMs, zone);
  if (stored) return { iso: stored, source: "stored" };
  if (!allowMaeFallback) return { iso: "", source: "" };
  const maeMs = Date.parse(String(occupiedMaeIso || ""));
  if (!Number.isFinite(maeMs)) return { iso: "", source: "" };
  if (maeMs > notBeforeMs && !maeIsBlackoutLocalTime(maeMs, zone)) {
    return { iso: new Date(maeMs).toISOString(), source: "mae_lane" };
  }
  const plus = maeAdvancePastBlackout(maeMs + MAE_STORY_COMPANION_OFFSET_MS, zone);
  if (plus <= notBeforeMs) return { iso: "", source: "" };
  return { iso: new Date(plus).toISOString(), source: "mae_plus_10" };
}

/**
 * Rebuild schedules for a list of items. Occupancy is per platform::outputType lane.
 * Stories still prefer companion offset when a same-package main exists; otherwise
 * they take the next open slot in their own Story lane.
 */
export function maeBuildSuggestedScheduleMap(items, occupiedByLane = {}, now = new Date(), options = {}) {
  const scheduleNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const notBeforeMs = scheduleNow.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const horizonDays = maeNormalizeHorizonDays(options.horizonDays, MAE_SUGGEST_HORIZON_DAYS);
  const reserved = {};
  for (const [lane, times] of Object.entries(occupiedByLane || {})) {
    reserved[lane] = [...(times || [])];
  }
  // Backward compatible: callers that still pass { Instagram: [...] } platform maps
  // are treated as that platform's shared lane only when no ::outputType key exists.
  const indexed = (items || []).map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const rank = (/story/i.test(String(a.item.output_type || "")) ? 1 : 0)
      - (/story/i.test(String(b.item.output_type || "")) ? 1 : 0);
    return rank || a.index - b.index;
  });
  const stamps = new Map();
  const platformOrder = [];
  for (const { item } of indexed) {
    if (/story/i.test(String(item.output_type || ""))) continue;
    const platform = String(item.platform || "").trim();
    if (platform && !platformOrder.includes(platform)) platformOrder.push(platform);
  }
  const spreadPlatforms = platformOrder.length > 1 && options.spreadPlatforms !== false;
  const packageDayByPlatform = new Map();
  const rememberPackageDay = (platform, iso) => {
    if (!iso || packageDayByPlatform.has(platform)) return;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return;
    packageDayByPlatform.set(platform, maeCivilWithKey(maeZonedDateTimeParts(new Date(ms), timeZone)).key);
  };
  const otherPackageDays = (platform) => new Set(
    [...packageDayByPlatform.entries()]
      .filter(([name]) => name !== platform)
      .map(([, civilKey]) => civilKey),
  );

  const laneTimes = (platform, outputType) => {
    const lane = maeScheduleLaneKey(platform, outputType);
    const typed = reserved[lane] || [];
    // Legacy platform-only occupancy (no ::) still blocks when present.
    const legacy = reserved[String(platform || "").trim()]
      || reserved[String(platform || "").trim().toLowerCase()]
      || [];
    return maeBlockingTimes(typed, legacy);
  };

  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = `${platform}::${outputType}`;
    const lane = maeScheduleLaneKey(platform, outputType);
    const isStory = /story/i.test(outputType);
    const existing = String(item.scheduled_at || "").trim();
    if (existing && !Number.isNaN(Date.parse(existing))) {
      const iso = new Date(existing).toISOString();
      const existingMs = Date.parse(iso);
      const laneOcc = laneTimes(platform, outputType);
      const existingCivil = maeCivilWithKey(maeZonedDateTimeParts(new Date(existingMs), timeZone));
      const standardsCovered = maeDayStandardsCovered(existingCivil, notBeforeMs, laneOcc, timeZone);
      const reusable = existingMs > notBeforeMs
        && !maeIsBlackoutLocalTime(existingMs, timeZone)
        && !maeScheduleConflicts(existingMs, laneOcc)
        && (
          maeIsPriorityLocalTime(existingMs, timeZone)
          || standardsCovered
          || isStory
        );
      if (reusable && options.preserveExisting !== false) {
        stamps.set(key, iso);
        (reserved[lane] ||= []).push(existingMs);
        if (!isStory) rememberPackageDay(platform, iso);
        continue;
      }
    }
    if (isStory) {
      const companion = maeStoryCompanionIso(stamps, platform, notBeforeMs);
      if (companion && options.storyCompanion !== false) {
        stamps.set(key, companion);
        (reserved[lane] ||= []).push(Date.parse(companion));
        continue;
      }
    }
    const pickOpts = {
      occupiedMs: laneTimes(platform, outputType),
      platformOccupiedMs: laneTimes(platform, outputType),
      timeZone,
      horizonDays,
      startCivilIndex: isStory || !spreadPlatforms
        ? 0
        : maePlatformSpreadStartIndex(platformOrder.indexOf(platform), platformOrder.length, horizonDays),
      avoidCivilKeys: isStory || !spreadPlatforms ? new Set() : otherPackageDays(platform),
    };
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, scheduleNow, pickOpts);
    let safeIso = iso && Number.isFinite(Date.parse(iso)) && Date.parse(iso) > notBeforeMs
      ? iso
      : maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, scheduleNow, {
          ...pickOpts,
          leadMs: options.leadMs ?? MAE_SUGGEST_LEAD_MS,
        });
    if (isStory && !(safeIso && Number.isFinite(Date.parse(safeIso)) && Date.parse(safeIso) > notBeforeMs)) {
      safeIso = maeStoryCompanionIso(stamps, platform, notBeforeMs);
    }
    stamps.set(key, safeIso);
    if (safeIso) {
      (reserved[lane] ||= []).push(Date.parse(safeIso));
      if (!isStory) rememberPackageDay(platform, safeIso);
    }
  }
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !/story/i.test(outputType)) continue;
    const key = `${platform}::${outputType}`;
    const current = String(stamps.get(key) || "").trim();
    if (current && Number.isFinite(Date.parse(current)) && Date.parse(current) > notBeforeMs) continue;
    const companion = maeStoryCompanionIso(stamps, platform, notBeforeMs);
    if (companion) {
      stamps.set(key, companion);
      const lane = maeScheduleLaneKey(platform, outputType);
      (reserved[lane] ||= []).push(Date.parse(companion));
    }
  }
  return stamps;
}

/** Sort regeneration combinations: platform → output type → profile. */
export function maeSortRegenCombinations(combinations = []) {
  return [...(combinations || [])].sort((a, b) => {
    const platform = String(a.platform || "").localeCompare(String(b.platform || ""), undefined, { sensitivity: "base" });
    if (platform) return platform;
    const output = String(a.output_type || a.outputType || "").localeCompare(
      String(b.output_type || b.outputType || ""),
      undefined,
      { sensitivity: "base" },
    );
    if (output) return output;
    return String(a.profile || a.profile_name || a.profileName || "").localeCompare(
      String(b.profile || b.profile_name || b.profileName || ""),
      undefined,
      { sensitivity: "base" },
    );
  });
}
