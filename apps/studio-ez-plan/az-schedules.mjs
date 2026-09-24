import {
  addCivilDays,
  chicagoDateTimeParts,
  chicagoWallToUtcMs,
  industryBestWindows,
  pickBalancedSuggestedIso,
} from "./suggested-schedules.mjs";

export const AZ_HORIZON_DAYS = 7;
export const AZ_OTHER_CLUSTER_MS = 30 * 60 * 1000;
export const AZ_OTHER_NEAR_MS = 3 * 60 * 60 * 1000;
export const AZ_STORY_OFFSET_MS = 10 * 60 * 1000;
export const AZ_LEAD_MS = 10 * 60 * 1000;

const WEEKDAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

export function chicagoWeekdayShort(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(date);
}

export function parseWindowStart(window) {
  const first = String(window || "12:00-13:00").split("-")[0] || "12:00";
  const [hh, mm] = first.split(":").map((n) => Number(n) || 0);
  return { hour: hh, minute: mm || 0 };
}

export function civilKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function chicagoCivilFromMs(ms) {
  const parts = chicagoDateTimeParts(new Date(ms));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekday: chicagoWeekdayShort(new Date(ms)),
    key: civilKey(parts.year, parts.month, parts.day),
  };
}

export function listHorizonCivils(now = new Date(), horizonDays = AZ_HORIZON_DAYS) {
  const chicago = chicagoDateTimeParts(now);
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const civil = i === 0
      ? { year: chicago.year, month: chicago.month, day: chicago.day }
      : addCivilDays(chicago.year, chicago.month, chicago.day, i);
    const noonMs = chicagoWallToUtcMs(civil.year, civil.month, civil.day, 12, 0);
    days.push({
      ...civil,
      index: i,
      weekday: chicagoWeekdayShort(new Date(noonMs)),
      key: civilKey(civil.year, civil.month, civil.day),
    });
  }
  return days;
}

export function isStoryType(outputType) {
  return /story/i.test(String(outputType || ""));
}

export function scheduleKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
}

function occupiedOnDay(occupiedMs, civil) {
  return (occupiedMs || []).filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    return chicagoCivilFromMs(ms).key === civil.key;
  });
}

function tooCloseToOthers(ms, occupiedMs, gapMs = AZ_OTHER_CLUSTER_MS) {
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}

function nearPenalty(ms, occupiedMs) {
  let penalty = 0;
  for (const other of occupiedMs || []) {
    if (!Number.isFinite(other)) continue;
    const gap = Math.abs(other - ms);
    if (gap < AZ_OTHER_CLUSTER_MS) penalty += 80;
    else if (gap < AZ_OTHER_NEAR_MS) penalty += 40;
  }
  return penalty;
}

export function windowCandidatesForDay(civil, windows, now, occupiedMs) {
  const nowMs = now.getTime() + AZ_LEAD_MS;
  const slots = [];
  for (let index = 0; index < (windows || []).length; index++) {
    const { hour, minute } = parseWindowStart(windows[index]);
    const ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hour, minute);
    if (ms <= nowMs) continue;
    if (tooCloseToOthers(ms, occupiedMs)) continue;
    slots.push({
      ms,
      iso: new Date(ms).toISOString(),
      windowIndex: index,
      window: windows[index],
    });
  }
  return slots;
}

export function scoreMainOnDay(civil, suggested, occupiedMs, now) {
  const days = Array.isArray(suggested?.days) ? suggested.days : [];
  const windows = Array.isArray(suggested?.windows) && suggested.windows.length
    ? suggested.windows
    : ["12:00-13:00"];
  const preferred = !days.length || days.includes(civil.weekday);
  const slots = windowCandidatesForDay(civil, windows, now, occupiedMs);
  if (!slots.length) return { score: -1000, slot: null, preferred };
  const slot = slots[0];
  const crowding = occupiedOnDay(occupiedMs, civil).length;
  let score = 80;
  score += preferred ? 18 : 0;
  score += Math.max(0, 24 - slot.windowIndex * 8);
  score -= crowding * 22;
  score -= nearPenalty(slot.ms, occupiedMs);
  score -= civil.index * 3;
  if (crowding === 0 && civil.index > 0) score += 8;
  return { score, slot, preferred, crowding };
}

export function pickCampaignDay(mains, bestTimesByKey, occupiedMs, now) {
  const days = listHorizonCivils(now);
  let best = null;
  for (const civil of days) {
    const parts = [];
    for (const item of mains) {
      const key = scheduleKey(item.platform, item.output_type);
      const suggested = bestTimesByKey[key] || industryBestWindows(item.platform, item.output_type);
      parts.push(scoreMainOnDay(civil, suggested, occupiedMs, now));
    }
    if (!parts.length) continue;
    const worst = Math.min(...parts.map((part) => part.score));
    const avg = parts.reduce((sum, part) => sum + part.score, 0) / parts.length;
    const crowding = occupiedOnDay(occupiedMs, civil).length;
    const total = avg + Math.min(0, worst) * 0.15 - crowding * 6;
    if (!best || total > best.total) {
      best = { civil, total, parts, crowding };
    }
  }
  return best;
}

function assignMainTimes(mains, civil, bestTimesByKey, occupiedMs, now) {
  const stamps = new Map();
  const reserved = [...(occupiedMs || [])];
  for (const item of mains) {
    const key = scheduleKey(item.platform, item.output_type);
    const suggested = bestTimesByKey[key] || industryBestWindows(item.platform, item.output_type);
    const scored = scoreMainOnDay(civil, suggested, reserved, now);
    const slot = scored.slot || windowCandidatesForDay(civil, suggested.windows || ["12:00-13:00"], now, reserved)[0];
    if (!slot) continue;
    stamps.set(key, slot.iso);
    reserved.push(slot.ms);
  }
  return stamps;
}

export function buildAzCampaignSchedule(items, { occupiedMs = [], bestTimesByKey = {}, now = new Date() } = {}) {
  const list = Array.isArray(items) ? items : [];
  const ordered = [
    ...list.filter((item) => !isStoryType(item.output_type)),
    ...list.filter((item) => isStoryType(item.output_type)),
  ];
  const stamps = new Map();
  const reservedAll = [...(occupiedMs || [])].filter((ms) => Number.isFinite(ms));
  const reservedByPlatform = {};
  for (const item of ordered) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = scheduleKey(platform, outputType);
    const suggested = bestTimesByKey[key] || industryBestWindows(platform, outputType);
    const iso = pickBalancedSuggestedIso(suggested.windows || ["12:00-13:00"], now, {
      days: suggested.days || [],
      occupiedMs: reservedAll,
      platformOccupiedMs: reservedByPlatform[platform] || [],
    });
    stamps.set(key, iso);
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) {
      reservedAll.push(ms);
      (reservedByPlatform[platform] ||= []).push(ms);
    }
  }
  const scheduledDays = [...new Set([...stamps.values()].map((iso) => chicagoCivilFromMs(Date.parse(iso)).key))];
  return {
    stamps,
    campaign: scheduledDays.length ? { key: scheduledDays[0] } : null,
    rationale: scheduledDays.length
      ? `spread across ${scheduledDays.length} day${scheduledDays.length === 1 ? "" : "s"} in the next ${AZ_HORIZON_DAYS} days`
      : "no open schedule in the next 7 days",
  };
}
