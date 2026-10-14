/** Strict MAE rotation in profile-local time.
 * Fill each day's morning → afternoon → evening MAE slots across a 28-day
 * (4-week) horizon before placing extras. Once those three are covered on every
 * day in range (or the next pick has no open MAE left), the 4th post on each
 * day goes in that day's largest open gap, walking day 1 → day 28. A 5th post
 * repeats the same day-by-day widest-gap walk.
 * Same-platform extras still share a day (IG morning, then IG afternoon).
 * Different platforms in one package skip days already used by that package
 * and start about a week apart so they spread across the 4-week window.
 * Stories may share a slot with their platform main.
 * Never stamp 11:00 PM–3:00 AM local (inclusive).
 */

export const MAE_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;
export const MAE_SUGGEST_HORIZON_DAYS = 28;
export const MAE_PRIORITY_SCHEDULE_WINDOWS = Object.freeze(["05:30-07:00", "11:30-13:00", "16:30-18:00"]);
export const MAE_SUGGEST_LEAD_MS = 10 * 60 * 1000;
/** Companion Stories sit this far after the same-platform main when MAE has no open slot. */
export const MAE_STORY_COMPANION_OFFSET_MS = 10 * 60 * 1000;
export const MAE_DEFAULT_TIME_ZONE = "America/Chicago";
/** Inclusive local blackout: 11:00 PM through 3:00 AM profile time. */
export const MAE_SCHEDULE_BLACKOUT_START_MINUTES = 23 * 60;
export const MAE_SCHEDULE_BLACKOUT_END_MINUTES = 3 * 60;
/** First allowed minute after overnight blackout (3:01 AM). */
export const MAE_SCHEDULE_OPEN_START_MINUTES = 3 * 60 + 1;
/** Last allowed minute before overnight blackout (10:59 PM). */
export const MAE_SCHEDULE_OPEN_END_MINUTES = 22 * 60 + 59;
/** Max non-MAE extras per civil day (4th then 5th post). */
export const MAE_MAX_EXTRA_POSTS_PER_DAY = 2;

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

export function maeFlattenOccupied(occupiedByPlatform) {
  return Object.values(occupiedByPlatform || {}).flat().filter((ms) => Number.isFinite(ms));
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

function maeExtraCountOnDay(civil, blockers, timeZone) {
  const day = maeCivilWithKey(civil);
  let count = 0;
  for (const ms of maeOccupiedOnDay(blockers, day, timeZone)) {
    if (!maeIsPriorityLocalTime(ms, timeZone)) count += 1;
  }
  return count;
}

function maeExtraIsoOnDay(civil, nowMs, blockers, timeZone) {
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
    const span = right - left;
    if (span <= 0) continue;
    const ms = Math.round((left + Math.round(span / 2)) / 60000) * 60000;
    if (ms < windowStart || ms > windowEnd || ms <= nowMs) continue;
    if (maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, posts)) continue;
    if (maeIsPriorityLocalTime(ms, timeZone)) continue;
    if (!best || span > best.span || (span === best.span && ms < best.ms)) best = { ms, span };
  }
  return best ? new Date(best.ms).toISOString() : "";
}

function maeBlockingTimes(occupiedMs, platformOccupiedMs) {
  const seen = new Set();
  const out = [];
  for (const ms of [...(occupiedMs || []), ...(platformOccupiedMs || [])]) {
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
  const days = Math.max(1, Number(horizonDays) || MAE_SUGGEST_HORIZON_DAYS);
  if (count <= 1) return 0;
  return Math.floor((index % count) * days / count);
}

function maePickExtraIso(civils, nowMs, blockers, timeZone, extrasAlreadyOnDay, avoidCivilKeys) {
  const avoid = maeAvoidCivilKeys(avoidCivilKeys);
  for (const civil of civils) {
    if (avoid.has(civil.key)) continue;
    if (!maeDayStandardsCovered(civil, nowMs, blockers, timeZone)) continue;
    // 4th wave wants days with 0 extras; 5th wave wants days that already have one.
    if (maeExtraCountOnDay(civil, blockers, timeZone) !== extrasAlreadyOnDay) continue;
    const extra = maeExtraIsoOnDay(civil, nowMs, blockers, timeZone);
    if (extra) return extra;
  }
  return "";
}

function maePickFromCivils(civils, nowMs, blockers, timeZone, avoidCivilKeys) {
  const avoid = maeAvoidCivilKeys(avoidCivilKeys);
  for (const civil of civils) {
    if (avoid.has(civil.key)) continue;
    for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
      const ms = maeStandardSlotMs(civil, window, timeZone);
      if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, blockers)) continue;
      return new Date(ms).toISOString();
    }
  }
  const fourth = maePickExtraIso(civils, nowMs, blockers, timeZone, 0, avoid);
  if (fourth) return fourth;
  const fifth = maePickExtraIso(civils, nowMs, blockers, timeZone, 1, avoid);
  if (fifth) return fifth;
  return "";
}

export function maePickBalancedSuggestedIso(_windows, now = new Date(), options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const blockers = maeBlockingTimes(occupiedMs, platformOccupiedMs);
  const nowMs = now.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const local = maeZonedDateTimeParts(now, timeZone);
  const horizonDays = Number(options.horizonDays) > 0
    ? Math.floor(Number(options.horizonDays))
    : MAE_SUGGEST_HORIZON_DAYS;
  const civils = maeWalkCivils(maeHorizonCivils(local, horizonDays), options.startCivilIndex);
  const avoid = maeAvoidCivilKeys(options.avoidCivilKeys);

  const spread = maePickFromCivils(civils, nowMs, blockers, timeZone, avoid);
  if (spread) return spread;
  if (avoid.size) return maePickFromCivils(civils, nowMs, blockers, timeZone, new Set());
  return "";
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
  });
}

export function maeAdvancePastBlackout(ms, timeZone = MAE_DEFAULT_TIME_ZONE) {
  if (!Number.isFinite(ms)) return ms;
  let cursor = ms;
  // Overnight blackout is 11:00 PM through 3:00 AM. Walk forward at most six hours.
  for (let i = 0; i < 6 * 60; i += 1) {
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
  // 5:30 / 11:30 / 16:30 is the empty-lane snap that publishes a Story right away.
  if (maeIsPriorityLocalTime(ms, timeZone)) return "";
  return new Date(ms).toISOString();
}

/** Story publish time. Same-platform main + 10 minutes wins. A stored MAE
 * instant does not: that is the slot an empty lane returns, and it goes out now. */
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
  const plus = maeAdvancePastBlackout(maeMs + MAE_STORY_COMPANION_OFFSET_MS, zone);
  if (plus <= notBeforeMs) return { iso: "", source: "" };
  return { iso: new Date(plus).toISOString(), source: "mae_plus_10" };
}

export function maeBuildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date(), options = {}) {
  // Freeze one authoritative instant for the entire regeneration pass. Every
  // reused or newly suggested slot must be strictly later than this instant
  // plus the normal lead window; a regenerate can never return a past slot.
  const scheduleNow = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const notBeforeMs = scheduleNow.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const reserved = {};
  for (const [platform, times] of Object.entries(occupiedByPlatform || {})) {
    reserved[platform] = [...(times || [])];
  }
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
  const spreadPlatforms = platformOrder.length > 1;
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
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = `${platform}::${outputType}`;
    const isStory = /story/i.test(outputType);
    const existing = String(item.scheduled_at || "").trim();
    if (existing && !Number.isNaN(Date.parse(existing))) {
      const iso = new Date(existing).toISOString();
      const existingMs = Date.parse(iso);
      // Stories may share a wall-clock slot with mains (UI / #507). They do not
      // read or write the platform MAE lane, so a busy calendar cannot blank them.
      const lane = isStory ? [] : maeFlattenOccupied(reserved);
      const existingCivil = maeCivilWithKey(maeZonedDateTimeParts(new Date(existingMs), timeZone));
      const standardsCovered = !isStory && maeDayStandardsCovered(
        existingCivil,
        notBeforeMs,
        lane,
        timeZone,
      );
      const extrasOnDay = isStory ? 0 : maeExtraCountOnDay(existingCivil, lane, timeZone);
      // Keep a stored MAE time when that day-part is still open. Keep a stored
      // extra only after that day's MAE trio is covered and the day still has
      // room for a 4th/5th. Never preserve a past or blackout slot.
      const reusable = existingMs > notBeforeMs
        && !maeIsBlackoutLocalTime(existingMs, timeZone)
        && (isStory || !maeScheduleConflicts(existingMs, lane))
        && (
          isStory
          || maeIsPriorityLocalTime(existingMs, timeZone)
          || (standardsCovered && extrasOnDay < MAE_MAX_EXTRA_POSTS_PER_DAY)
        );
      if (reusable) {
        stamps.set(key, iso);
        if (!isStory) {
          (reserved[platform] ||= []).push(existingMs);
          rememberPackageDay(platform, iso);
        }
        continue;
      }
    }
    // Companion Stories follow the same-platform main by 10 minutes (AZ offset).
    // They must never compete for MAE slots or come back blank on a full calendar.
    if (isStory) {
      const companion = maeStoryCompanionIso(stamps, platform, notBeforeMs);
      if (companion) {
        stamps.set(key, companion);
        continue;
      }
    }
    const pickOpts = {
      occupiedMs: isStory ? [] : maeFlattenOccupied(reserved),
      platformOccupiedMs: isStory ? [] : (reserved[platform] || []),
      timeZone,
      startCivilIndex: isStory || !spreadPlatforms
        ? 0
        : maePlatformSpreadStartIndex(platformOrder.indexOf(platform), platformOrder.length),
      avoidCivilKeys: isStory || !spreadPlatforms ? new Set() : otherPackageDays(platform),
    };
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, scheduleNow, pickOpts);
    // Defense in depth: even if a future scheduler change accidentally hands
    // back an expired candidate, never persist it from a regenerate.
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
    if (!isStory && safeIso) {
      (reserved[platform] ||= []).push(Date.parse(safeIso));
      rememberPackageDay(platform, safeIso);
    }
  }
  // Last resort: any Story still blank gets same-platform main + 10 minutes.
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !/story/i.test(outputType)) continue;
    const key = `${platform}::${outputType}`;
    const current = String(stamps.get(key) || "").trim();
    if (current && Number.isFinite(Date.parse(current)) && Date.parse(current) > notBeforeMs) continue;
    const companion = maeStoryCompanionIso(stamps, platform, notBeforeMs);
    if (companion) stamps.set(key, companion);
  }
  return stamps;
}
