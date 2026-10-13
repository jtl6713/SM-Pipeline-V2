export const SUGGESTED_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;
export const SUGGESTED_HORIZON_DAYS = 28;
export const SUGGESTED_LEAD_MS = 10 * 60 * 1000;

export function industryBestWindows(platform, outputType) {
  const p = String(platform || "").toLowerCase();
  const t = String(outputType || "").toLowerCase();
  if (p.includes("tiktok")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["19:00-21:00"], label: "TikTok weekday evenings" };
  if (p.includes("youtube") && (t.includes("standard") || t.includes("long"))) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["10:00-16:00"], label: "YouTube standard weekday daytime" };
  if (p.includes("youtube")) return { days: ["Wed", "Thu", "Fri", "Sat"], windows: ["14:00-16:00", "20:00-22:00"], label: "YouTube Short afternoon/evening" };
  if (t.includes("story")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["16:00-18:00", "19:00-21:00"], label: "Stories late afternoon/evening" };
  if (t.includes("carousel") || t.includes("single") || t.includes("feed") || t.includes("multi-image") || t.includes("photo")) {
    return { days: ["Wed", "Thu"], windows: ["12:00-14:00", "18:00-20:00"], label: "Feed/carousel midday or evening" };
  }
  if (p.includes("facebook")) return { days: ["Tue", "Wed", "Thu"], windows: ["12:00-13:00", "18:00-20:00"], label: "Facebook Reel lunch/evening" };
  return { days: ["Tue", "Wed", "Thu"], windows: ["11:00-13:00", "18:00-21:00"], label: "Reel midday or evening" };
}

export function chicagoDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
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

export function chicagoWallToUtcMs(year, month, day, hour, minute) {
  const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ms = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
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

export function chicagoWeekdayShort(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
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

export function listHorizonCivils(now = new Date(), horizonDays = SUGGESTED_HORIZON_DAYS) {
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

function occupiedOnDay(occupiedMs, civil) {
  return (occupiedMs || []).filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    const parts = chicagoDateTimeParts(new Date(ms));
    return civilKey(parts.year, parts.month, parts.day) === civil.key;
  });
}

export function flattenOccupiedByPlatform(occupiedByPlatform) {
  return Object.values(occupiedByPlatform || {}).flat().filter((ms) => Number.isFinite(ms));
}

function timeCrowding(ms, occupiedMs, radiusMinutes = 90) {
  const target = chicagoDateTimeParts(new Date(ms));
  const targetMinutes = target.hour * 60 + target.minute;
  let count = 0;
  for (const other of occupiedMs || []) {
    if (!Number.isFinite(other)) continue;
    const parts = chicagoDateTimeParts(new Date(other));
    const otherMinutes = parts.hour * 60 + parts.minute;
    const raw = Math.abs(targetMinutes - otherMinutes);
    const distance = Math.min(raw, 1440 - raw);
    if (distance <= radiusMinutes) count += 1;
  }
  return count;
}

function scoreAnalyticsSlot({ preferred, windowIndex, crowding, platformCrowding, timeCrowding: sameTimeCrowding, dayIndex }) {
  let score = 100;
  score += preferred ? 18 : 0;
  score += Math.max(0, 12 - windowIndex * 5);
  score += platformCrowding === 0 ? 14 : 0;
  score += crowding === 0 ? 8 : 0;
  score -= Math.min(platformCrowding, 4) * 42;
  score -= Math.min(crowding, 8) * 12;
  score -= Math.min(sameTimeCrowding, 6) * 8;
  score -= dayIndex * 1.5;
  return score;
}

export function pickBalancedSuggestedIso(windows, now = new Date(), options = {}) {
  const daysPref = Array.isArray(options.days) ? options.days.filter(Boolean) : [];
  const occupiedMs = options.occupiedMs || [];
  const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
  const gapMs = options.gapMs ?? SUGGESTED_SCHEDULE_GAP_MS;
  const leadMs = options.leadMs ?? SUGGESTED_LEAD_MS;
  const windowList = Array.isArray(windows) && windows.length ? windows : ["12:00-13:00"];
  const nowMs = now.getTime() + leadMs;
  const horizonDays = options.horizonDays || SUGGESTED_HORIZON_DAYS;
  const rawHorizon = listHorizonCivils(now, horizonDays);
  const start = rawHorizon.length
    ? ((Number(options.startCivilIndex) || 0) % rawHorizon.length + rawHorizon.length) % rawHorizon.length
    : 0;
  const horizon = [...rawHorizon.slice(start), ...rawHorizon.slice(0, start)];
  const avoid = new Set(options.avoidCivilKeys || []);

  const collect = () => {
    let best = null;
    for (const civil of horizon) {
      if (avoid.has(civil.key)) continue;
      const preferred = !daysPref.length || daysPref.includes(civil.weekday);
      const crowding = occupiedOnDay(occupiedMs, civil).length;
      const platformCrowding = occupiedOnDay(platformOccupiedMs, civil).length;
      for (let windowIndex = 0; windowIndex < windowList.length; windowIndex++) {
        const { hour, minute } = parseWindowStart(windowList[windowIndex]);
        const ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hour, minute);
        if (ms <= nowMs) continue;
        if (scheduleConflicts(ms, platformOccupiedMs, gapMs)) continue;
        const sameTimeCrowding = timeCrowding(ms, occupiedMs);
        const score = scoreAnalyticsSlot({
          preferred,
          windowIndex,
          crowding,
          platformCrowding,
          timeCrowding: sameTimeCrowding,
          dayIndex: civil.index,
        });
        if (!best || score > best.score) best = { score, ms };
      }
    }
    return best;
  };

  const balanced = collect();
  if (balanced) return new Date(balanced.ms).toISOString();
  return nextOpenScheduleIso(suggestedChicagoIsoFallback(windowList, now, leadMs), platformOccupiedMs, gapMs);
}

function suggestedChicagoIsoFallback(windows, now, leadMs = SUGGESTED_LEAD_MS) {
  const first = String(windows?.[0] || "12:00-13:00");
  const start = first.split("-")[0] || "12:00";
  const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
  const chicago = chicagoDateTimeParts(now);
  let civil = { year: chicago.year, month: chicago.month, day: chicago.day };
  let ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
  if (ms <= now.getTime() + leadMs) {
    civil = addCivilDays(civil.year, civil.month, civil.day, 1);
    ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
  }
  return new Date(ms).toISOString();
}

export function suggestedChicagoIso(windows, now = new Date(), options = {}) {
  return pickBalancedSuggestedIso(windows, now, options);
}

export function scheduleConflicts(ms, occupiedMs, gapMs = SUGGESTED_SCHEDULE_GAP_MS) {
  if (!Number.isFinite(ms)) return false;
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}

export function nextOpenScheduleIso(candidateIso, occupiedMs, gapMs = SUGGESTED_SCHEDULE_GAP_MS) {
  let ms = Date.parse(candidateIso);
  if (Number.isNaN(ms)) ms = Date.now();
  let guard = 0;
  while (scheduleConflicts(ms, occupiedMs, gapMs) && guard < 36) {
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

export function buildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date()) {
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
  const platformOrder = [];
  for (const { item } of indexed) {
    if (storyRank(item.output_type) === 1) continue;
    const platform = String(item.platform || "").trim();
    if (platform && !platformOrder.includes(platform)) platformOrder.push(platform);
  }
  const packageDayByPlatform = new Map();
  const rememberPackageDay = (platform, iso) => {
    if (!iso || packageDayByPlatform.has(platform)) return;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return;
    const parts = chicagoDateTimeParts(new Date(ms));
    packageDayByPlatform.set(platform, civilKey(parts.year, parts.month, parts.day));
  };
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = `${platform}::${outputType}`;
    const isStory = storyRank(outputType) === 1;
    const existing = String(item.scheduled_at || "").trim();
    if (existing && !Number.isNaN(Date.parse(existing))) {
      const iso = new Date(existing).toISOString();
      stamps.set(key, iso);
      // Stories may share a wall-clock slot; keep them out of the platform lane.
      if (!isStory) {
        (reserved[platform] ||= []).push(Date.parse(iso));
        rememberPackageDay(platform, iso);
      }
      continue;
    }
    const industry = industryBestWindows(platform, outputType);
    const spread = !isStory && platformOrder.length > 1;
    const startCivilIndex = spread
      ? Math.floor(Math.max(0, platformOrder.indexOf(platform)) * SUGGESTED_HORIZON_DAYS / platformOrder.length)
      : 0;
    const avoidCivilKeys = spread
      ? [...packageDayByPlatform.entries()].filter(([name]) => name !== platform).map(([, day]) => day)
      : [];
    const iso = pickBalancedSuggestedIso(industry.windows, now, {
      days: industry.days,
      // Stories ignore occupancy so IG/FB Stories can share a slot with mains.
      occupiedMs: isStory ? [] : flattenOccupiedByPlatform(reserved),
      platformOccupiedMs: isStory ? [] : (reserved[platform] || []),
      startCivilIndex,
      avoidCivilKeys,
    });
    stamps.set(key, iso);
    if (!isStory) {
      (reserved[platform] ||= []).push(Date.parse(iso));
      rememberPackageDay(platform, iso);
    }
  }
  return stamps;
}
