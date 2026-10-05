/** Strict MAE rotation in profile-local time.
 * Fill week-1 mornings, then afternoons, then evenings, then week-2 mornings:
 * M1… A1… E1… M2…
 * Never stamp 8:00 PM–3:30 AM local (inclusive).
 */

export const MAE_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;
export const MAE_SUGGEST_HORIZON_DAYS = 14;
export const MAE_PRIORITY_SCHEDULE_WINDOWS = Object.freeze(["05:30-07:00", "11:30-13:00", "16:30-18:00"]);
export const MAE_PRIORITY_WINDOW_OFFSETS_MINUTES = Object.freeze([0, 30, 60, 90]);
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
  const allowed = [];
  for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
    const [start] = String(window).split("-");
    const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
    for (const offset of MAE_PRIORITY_WINDOW_OFFSETS_MINUTES) {
      allowed.push(hh * 60 + mm + offset);
    }
  }
  return allowed;
}

export function maeIsPriorityLocalTime(ms, timeZone = MAE_DEFAULT_TIME_ZONE) {
  if (!Number.isFinite(ms) || maeIsBlackoutLocalTime(ms, timeZone)) return false;
  const parts = maeZonedDateTimeParts(new Date(ms), timeZone);
  return maeAllowedMinutes().includes(parts.hour * 60 + parts.minute);
}

function maeWidestGapFallbackIso(local, nowMs, occupiedMs, platformOccupiedMs, timeZone) {
  const candidates = [];
  const sortedOccupied = (occupiedMs || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  for (let dayOffset = 0; dayOffset < MAE_SUGGEST_HORIZON_DAYS; dayOffset++) {
    const civil = maeAddCivilDays(local.year, local.month, local.day, dayOffset);
    for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
      const [start] = window.split("-");
      const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
      for (const offset of MAE_PRIORITY_WINDOW_OFFSETS_MINUTES) {
        const totalMinutes = hh * 60 + mm + offset;
        const hour = Math.floor(totalMinutes / 60);
        const min = totalMinutes % 60;
        const ms = maeZonedWallToUtcMs(civil.year, civil.month, civil.day, hour, min, timeZone);
        if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, platformOccupiedMs)) continue;
        let previous = nowMs;
        let next = ms + 24 * 60 * 60 * 1000;
        for (const occupied of sortedOccupied) {
          if (occupied <= ms && occupied > previous) previous = occupied;
          if (occupied > ms) {
            next = occupied;
            break;
          }
        }
        candidates.push({ ms, clearance: Math.min(ms - previous, next - ms) });
      }
    }
  }
  if (!candidates.length) return "";
  const widest = Math.max(...candidates.map((item) => item.clearance));
  const best = candidates.filter((item) => item.clearance === widest);
  return new Date(best[0].ms).toISOString();
}

export function maePickBalancedSuggestedIso(_windows, now = new Date(), options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const nowMs = now.getTime() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  const local = maeZonedDateTimeParts(now, timeZone);
  const horizon = [];
  for (let i = 0; i < MAE_SUGGEST_HORIZON_DAYS; i++) {
    const civilBase = i === 0
      ? { year: local.year, month: local.month, day: local.day }
      : maeAddCivilDays(local.year, local.month, local.day, i);
    horizon.push({ ...civilBase, index: i, key: maeCivilKey(civilBase.year, civilBase.month, civilBase.day) });
  }

  // Strict scheduling passes:
  // 1-3: days 1-7 morning, midday, late afternoon.
  // 4-6: days 8-14 morning, midday, late afternoon.
  const dayBands = [[0, 7], [7, 14]];
  for (const [startDay, endDay] of dayBands) {
    for (const window of MAE_PRIORITY_SCHEDULE_WINDOWS) {
      const [start] = window.split("-");
      const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
      const startMinutes = hh * 60 + mm;
      const balancedDays = horizon
        .slice(startDay, endDay)
        .filter(Boolean)
        .map((civil) => ({
          civil,
          occupiedCount: maeOccupiedOnDay(occupiedMs, civil, timeZone).length,
        }))
        .sort((a, b) => a.occupiedCount - b.occupiedCount || a.civil.index - b.civil.index);
      for (const { civil } of balancedDays) {
        for (const offsetMinutes of MAE_PRIORITY_WINDOW_OFFSETS_MINUTES) {
          const totalMinutes = startMinutes + offsetMinutes;
          const candidateHour = Math.floor(totalMinutes / 60);
          const candidateMinute = totalMinutes % 60;
          const ms = maeZonedWallToUtcMs(civil.year, civil.month, civil.day, candidateHour, candidateMinute, timeZone);
          if (ms <= nowMs || maeIsBlackoutLocalTime(ms, timeZone) || maeScheduleConflicts(ms, platformOccupiedMs)) continue;
          return new Date(ms).toISOString();
        }
      }
    }
  }

  return maeWidestGapFallbackIso(local, nowMs, occupiedMs, platformOccupiedMs, timeZone);
}

export function maeNextOpenScheduleIso(candidateIso, occupiedMs, gapMs = MAE_SCHEDULE_GAP_MS, options = {}) {
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const now = options.now instanceof Date ? options.now : new Date();
  const ms = Date.parse(candidateIso);
  if (
    Number.isFinite(ms)
    && ms > now.getTime()
    && maeIsPriorityLocalTime(ms, timeZone)
    && !maeIsBlackoutLocalTime(ms, timeZone)
    && !maeScheduleConflicts(ms, occupiedMs, gapMs)
  ) {
    return new Date(ms).toISOString();
  }
  return maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
    occupiedMs: occupiedMs || [],
    platformOccupiedMs: occupiedMs || [],
    timeZone,
  });
}

export function maeBuildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date(), options = {}) {
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
      if (maeIsPriorityLocalTime(existingMs, timeZone) && !maeIsBlackoutLocalTime(existingMs, timeZone)) {
        stamps.set(key, iso);
        if (!isStory) (reserved[platform] ||= []).push(existingMs);
        continue;
      }
    }
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: isStory ? [] : maeFlattenOccupied(reserved),
      platformOccupiedMs: isStory ? [] : (reserved[platform] || []),
      timeZone,
    });
    stamps.set(key, iso);
    if (!isStory) (reserved[platform] ||= []).push(Date.parse(iso));
  }
  return stamps;
}
