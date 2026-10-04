export const SUGGESTED_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;
export const SUGGESTED_HORIZON_DAYS = 14;
export const SUGGESTED_LEAD_MS = 10 * 60 * 1000;

/** Strict rolling passes: morning → midday → late afternoon, days 1-7 then 8-14. */
export const PRIORITY_SCHEDULE_WINDOWS = Object.freeze([
  "05:30-07:00",
  "11:30-13:00",
  "16:30-18:00",
]);
export const PRIORITY_WINDOW_OFFSETS_MINUTES = Object.freeze([0, 30, 60, 90]);

/** Local overnight blackout in the active profile timezone (default Chicago). */
export const SCHEDULE_BLACKOUT_START_MINUTES = 20 * 60; // 8:00 PM
export const SCHEDULE_BLACKOUT_END_MINUTES = 3 * 60 + 30; // 3:30 AM inclusive
export const DEFAULT_SCHEDULE_TIME_ZONE = "America/Chicago";

/** Heatmap overnight buckets must never become schedule targets. */
const OVERNIGHT_HEATMAP_WINDOWS = new Set(["00:00-06:00", "22:00-00:00"]);

/**
 * @deprecated Placement no longer uses industry analytics windows.
 * Kept as a safe stub so leftover callers still get the manual MAE spread.
 * First-party learning is collected separately and is not applied to scheduling yet.
 */
export function industryBestWindows(_platform, _outputType) {
  return {
    days: [],
    windows: [...PRIORITY_SCHEDULE_WINDOWS],
    label: "Manual morning / afternoon / evening spread",
  };
}

export function manualSpreadWindows() {
  return {
    days: [],
    windows: [...PRIORITY_SCHEDULE_WINDOWS],
    label: "Manual morning / afternoon / evening spread",
  };
}

export function normalizeTimeZone(value) {
  const zone = String(value || "").trim() || DEFAULT_SCHEDULE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return DEFAULT_SCHEDULE_TIME_ZONE;
  }
}

export function chicagoDateTimeParts(date = new Date(), timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
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

export function chicagoWallToUtcMs(year, month, day, hour, minute, timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ms = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
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

export function addCivilDays(year, month, day, delta) {
  const utc = Date.UTC(year, month - 1, day) + delta * 86400000;
  const next = new Date(utc);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function chicagoWeekdayShort(date = new Date(), timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    weekday: "short",
  }).format(date);
}

export function civilKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWindowStart(window) {
  const first = String(window || "12:00-13:00").split("-")[0] || "12:00";
  const [hh, mm] = first.split(":").map((n) => Number(n) || 0);
  return { hour: hh, minute: mm || 0 };
}

export function listHorizonCivils(now = new Date(), horizonDays = SUGGESTED_HORIZON_DAYS, timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  const local = chicagoDateTimeParts(now, timeZone);
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const civil = i === 0
      ? { year: local.year, month: local.month, day: local.day }
      : addCivilDays(local.year, local.month, local.day, i);
    const noonMs = chicagoWallToUtcMs(civil.year, civil.month, civil.day, 12, 0, timeZone);
    days.push({
      ...civil,
      index: i,
      weekday: chicagoWeekdayShort(new Date(noonMs), timeZone),
      key: civilKey(civil.year, civil.month, civil.day),
    });
  }
  return days;
}

function occupiedOnDay(occupiedMs, civil, timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  return (occupiedMs || []).filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    const parts = chicagoDateTimeParts(new Date(ms), timeZone);
    return civilKey(parts.year, parts.month, parts.day) === civil.key;
  });
}

export function flattenOccupiedByPlatform(occupiedByPlatform) {
  return Object.values(occupiedByPlatform || {}).flat().filter((ms) => Number.isFinite(ms));
}

export function scheduleConflicts(ms, occupiedMs, gapMs = SUGGESTED_SCHEDULE_GAP_MS) {
  if (!Number.isFinite(ms)) return false;
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}

export function isBlackoutLocalTime(ms, timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  if (!Number.isFinite(ms)) return false;
  const parts = chicagoDateTimeParts(new Date(ms), timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= SCHEDULE_BLACKOUT_START_MINUTES || minutes <= SCHEDULE_BLACKOUT_END_MINUTES;
}

export function advancePastBlackout(ms, timeZone = DEFAULT_SCHEDULE_TIME_ZONE) {
  if (!Number.isFinite(ms) || !isBlackoutLocalTime(ms, timeZone)) return ms;
  const parts = chicagoDateTimeParts(new Date(ms), timeZone);
  let civil = { year: parts.year, month: parts.month, day: parts.day };
  if (parts.hour >= 20) civil = addCivilDays(civil.year, civil.month, civil.day, 1);
  return chicagoWallToUtcMs(civil.year, civil.month, civil.day, 4, 0, timeZone);
}

/** Drop overnight heatmap buckets so analytics never park posts at 11:30 PM / 2:30 AM. */
export function sanitizeScheduleWindows(windows) {
  const list = Array.isArray(windows) ? windows.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const safe = list.filter((window) => {
    if (OVERNIGHT_HEATMAP_WINDOWS.has(window)) return false;
    const { hour, minute } = parseWindowStart(window);
    const startMinutes = hour * 60 + minute;
    // Reject anything that starts inside the overnight blackout.
    return !(startMinutes >= SCHEDULE_BLACKOUT_START_MINUTES || startMinutes <= SCHEDULE_BLACKOUT_END_MINUTES);
  });
  return safe.length ? safe : [...PRIORITY_SCHEDULE_WINDOWS];
}

function widestGapFallbackIso(local, nowMs, occupiedMs, platformOccupiedMs, timeZone, gapMs) {
  const candidates = [];
  const sortedOccupied = (occupiedMs || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  for (let dayOffset = 0; dayOffset < SUGGESTED_HORIZON_DAYS; dayOffset++) {
    const civil = addCivilDays(local.year, local.month, local.day, dayOffset);
    for (let minute = 4 * 60; minute < 20 * 60; minute += 30) {
      const hour = Math.floor(minute / 60);
      const min = minute % 60;
      const ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hour, min, timeZone);
      if (ms <= nowMs || isBlackoutLocalTime(ms, timeZone) || scheduleConflicts(ms, platformOccupiedMs, gapMs)) continue;
      let previous = nowMs;
      let next = ms + 24 * 60 * 60 * 1000;
      for (const occupied of sortedOccupied) {
        if (occupied <= ms && occupied > previous) previous = occupied;
        if (occupied > ms) {
          next = occupied;
          break;
        }
      }
      const clearance = Math.min(ms - previous, next - ms);
      candidates.push({ ms, clearance });
    }
  }
  if (!candidates.length) return "";
  const widest = Math.max(...candidates.map((item) => item.clearance));
  const best = candidates.filter((item) => item.clearance === widest);
  const picked = best[Math.floor(Math.random() * best.length)];
  return new Date(picked.ms).toISOString();
}

/**
 * Strict profile scheduling:
 * 1-3) days 1-7 morning, midday, late afternoon
 * 4-6) days 8-14 morning, midday, late afternoon
 * then widest non-blackout gap inside the same 14-day horizon.
 *
 * Industry / analytics `windows` and preferred `days` are ignored for automatic
 * placement so overnight heatmap buckets cannot recreate 11:30 PM / 2:30 AM clumps.
 */
export function pickBalancedSuggestedIso(_windows, now = new Date(), options = {}) {
  const timeZone = normalizeTimeZone(options.timeZone);
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const gapMs = options.gapMs ?? SUGGESTED_SCHEDULE_GAP_MS;
  const leadMs = options.leadMs ?? SUGGESTED_LEAD_MS;
  const nowMs = now.getTime() + leadMs;
  const local = chicagoDateTimeParts(now, timeZone);
  const horizon = listHorizonCivils(now, SUGGESTED_HORIZON_DAYS, timeZone);

  const dayBands = [[0, 7], [7, 14]];
  for (const [startDay, endDay] of dayBands) {
    for (const window of PRIORITY_SCHEDULE_WINDOWS) {
      const [start] = window.split("-");
      const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
      const startMinutes = hh * 60 + mm;
      const balancedDays = horizon
        .slice(startDay, endDay)
        .filter(Boolean)
        .map((civil) => ({
          civil,
          occupiedCount: occupiedOnDay(occupiedMs, civil, timeZone).length,
        }))
        .sort((a, b) => a.occupiedCount - b.occupiedCount || a.civil.index - b.civil.index);
      for (const { civil } of balancedDays) {
        for (const offsetMinutes of PRIORITY_WINDOW_OFFSETS_MINUTES) {
          const totalMinutes = startMinutes + offsetMinutes;
          const candidateHour = Math.floor(totalMinutes / 60);
          const candidateMinute = totalMinutes % 60;
          const ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, candidateHour, candidateMinute, timeZone);
          if (ms <= nowMs || isBlackoutLocalTime(ms, timeZone) || scheduleConflicts(ms, platformOccupiedMs, gapMs)) continue;
          return new Date(ms).toISOString();
        }
      }
    }
  }

  return widestGapFallbackIso(local, nowMs, occupiedMs, platformOccupiedMs, timeZone, gapMs);
}

export function suggestedChicagoIso(windows, now = new Date(), options = {}) {
  return pickBalancedSuggestedIso(windows, now, options);
}

export function nextOpenScheduleIso(candidateIso, occupiedMs, gapMs = SUGGESTED_SCHEDULE_GAP_MS, options = {}) {
  const timeZone = normalizeTimeZone(options.timeZone);
  let ms = Date.parse(candidateIso);
  if (Number.isNaN(ms)) ms = Date.now();
  let guard = 0;
  while (guard < 72) {
    ms = advancePastBlackout(ms, timeZone);
    if (!scheduleConflicts(ms, occupiedMs, gapMs) && !isBlackoutLocalTime(ms, timeZone)) break;
    ms += gapMs;
    guard += 1;
  }
  return new Date(ms).toISOString();
}

function storyRank(outputType) {
  return /story/i.test(String(outputType || "")) ? 1 : 0;
}

export function planScheduleItems(planned) {
  const items = [];
  const seen = new Set();
  const push = (platform, outputType) => {
    const p = String(platform || "").trim();
    const t = String(outputType || "").trim();
    if (!p || !t) return;
    const key = `${p}::${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ platform: p, output_type: t });
  };
  for (const item of planned?.items || []) push(item.platform, item.output_type);
  for (const extra of planned?.extras || []) {
    const [platform, ...rest] = String(extra).split("::");
    push(platform, rest.join("::"));
  }
  return items;
}

export function buildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date(), options = {}) {
  const timeZone = normalizeTimeZone(options.timeZone);
  const reserved = {};
  for (const [platform, times] of Object.entries(occupiedByPlatform || {})) {
    reserved[platform] = [...(times || [])];
  }
  const indexed = (items || []).map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const rank = storyRank(a.item.output_type) - storyRank(b.item.output_type);
    return rank || a.index - b.index;
  });
  const stamps = new Map();
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = `${platform}::${outputType}`;
    const existing = String(item.scheduled_at || "").trim();
    if (existing && !Number.isNaN(Date.parse(existing))) {
      const iso = new Date(existing).toISOString();
      const existingMs = Date.parse(iso);
      if (!isBlackoutLocalTime(existingMs, timeZone)) {
        stamps.set(key, iso);
        (reserved[platform] ||= []).push(existingMs);
        continue;
      }
    }
    const iso = pickBalancedSuggestedIso(PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: flattenOccupiedByPlatform(reserved),
      platformOccupiedMs: reserved[platform] || [],
      timeZone,
    });
    stamps.set(key, iso);
    (reserved[platform] ||= []).push(Date.parse(iso));
  }
  return stamps;
}
