/** Strict MAE rotation in profile-local time.
 * One post per day-part across platforms. Fill each day morning → afternoon →
 * evening. Once those three are covered, the next post goes in the largest
 * open gap on that day, then day 2, then day 3. Instagram at 5:30 means
 * Facebook takes 11:30, not another 5:30.
 * Never stamp 8:00 PM–3:30 AM local (inclusive). Stories may share a slot.
 */

export const MAE_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;
export const MAE_SUGGEST_HORIZON_DAYS = 14;
export const MAE_PRIORITY_SCHEDULE_WINDOWS = Object.freeze(["05:30-07:00", "11:30-13:00", "16:30-18:00"]);
export const MAE_SUGGEST_LEAD_MS = 10 * 60 * 1000;
export const MAE_DEFAULT_TIME_ZONE = "America/Chicago";
export const MAE_SCHEDULE_BLACKOUT_START_MINUTES = 20 * 60;
export const MAE_SCHEDULE_BLACKOUT_END_MINUTES = 3 * 60 + 30;

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

function maeDayStandardsCovered(civil, nowMs, blockers, timeZone) {
  for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
    const ms = maeStandardSlotMs(civil, window, timeZone);
    if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone)) continue;
    if (!maeScheduleConflicts(ms, blockers)) return false;
  }
  return true;
}

function maeExtraIsoOnDay(civil, nowMs, blockers, timeZone) {
  const openStart = maeZonedWallToUtcMs(civil.year, civil.month, civil.day, 3, 31, timeZone);
  const openEnd = maeZonedWallToUtcMs(civil.year, civil.month, civil.day, 19, 59, timeZone);
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

export function maePickBalancedSuggestedIso(_windows, now = new Date(), options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const blockers = maeBlockingTimes(occupiedMs, platformOccupiedMs);
  const nowMs = now.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const local = maeZonedDateTimeParts(now, timeZone);

  // Each civil day: morning, then afternoon, then evening. Once those three are
  // covered, the extra goes in the largest gap on that day before the next morning.
  for (let i = 0; i < MAE_SUGGEST_HORIZON_DAYS; i++) {
    const civil = i === 0
      ? { year: local.year, month: local.month, day: local.day }
      : maeAddCivilDays(local.year, local.month, local.day, i);
    for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
      const ms = maeStandardSlotMs(civil, window, timeZone);
      if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, blockers)) continue;
      return new Date(ms).toISOString();
    }
    if (!maeDayStandardsCovered(civil, nowMs, blockers, timeZone)) continue;
    const extra = maeExtraIsoOnDay(civil, nowMs, blockers, timeZone);
    if (extra) return extra;
  }

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
      const lane = isStory ? [] : maeFlattenOccupied(reserved);
      const existingCivil = maeZonedDateTimeParts(new Date(existingMs), timeZone);
      const standardsCovered = !isStory && maeDayStandardsCovered(
        existingCivil,
        notBeforeMs,
        lane,
        timeZone,
      );
      // Keep a stored MAE time when that day-part is still open. Keep a stored
      // extra only after morning, afternoon, and evening on that day are covered.
      // Regeneration must never preserve a slot that is already passed or inside
      // the normal scheduling lead window. Using the same lead threshold as new
      // suggestions prevents a just-expired 05:30 slot from surviving a regenerate.
      const reusable = existingMs > notBeforeMs
        && !maeIsBlackoutLocalTime(existingMs, timeZone)
        && (isStory || !maeScheduleConflicts(existingMs, lane))
        && (maeIsPriorityLocalTime(existingMs, timeZone) || standardsCovered);
      if (reusable) {
        stamps.set(key, iso);
        if (!isStory) (reserved[platform] ||= []).push(existingMs);
        continue;
      }
    }
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, scheduleNow, {
      occupiedMs: isStory ? [] : maeFlattenOccupied(reserved),
      platformOccupiedMs: isStory ? [] : (reserved[platform] || []),
      timeZone,
    });
    // Defense in depth: even if a future scheduler change accidentally hands
    // back an expired candidate, never persist it from a regenerate.
    const safeIso = iso && Number.isFinite(Date.parse(iso)) && Date.parse(iso) > notBeforeMs
      ? iso
      : maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, scheduleNow, {
          occupiedMs: isStory ? [] : maeFlattenOccupied(reserved),
          platformOccupiedMs: isStory ? [] : (reserved[platform] || []),
          timeZone,
          leadMs: options.leadMs ?? MAE_SUGGEST_LEAD_MS,
        });
    stamps.set(key, safeIso);
    if (!isStory && safeIso) (reserved[platform] ||= []).push(Date.parse(safeIso));
  }
  return stamps;
}
