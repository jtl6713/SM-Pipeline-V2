export const SUGGESTED_SCHEDULE_GAP_MS = 90 * 60 * 1000;

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

export function suggestedChicagoIso(windows, now = new Date()) {
  const first = String(windows?.[0] || "12:00-13:00");
  const start = first.split("-")[0] || "12:00";
  const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
  const chicago = chicagoDateTimeParts(now);
  let civil = { year: chicago.year, month: chicago.month, day: chicago.day };
  let ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
  if (ms <= now.getTime() + 10 * 60 * 1000) {
    civil = addCivilDays(civil.year, civil.month, civil.day, 1);
    ms = chicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
  }
  return new Date(ms).toISOString();
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
  for (const { item } of indexed) {
    const platform = String(item.platform || "").trim();
    const outputType = String(item.output_type || "").trim();
    if (!platform || !outputType) continue;
    const key = `${platform}::${outputType}`;
    const existing = String(item.scheduled_at || "").trim();
    if (existing && !Number.isNaN(Date.parse(existing))) {
      const iso = new Date(existing).toISOString();
      stamps.set(key, iso);
      (reserved[platform] ||= []).push(Date.parse(iso));
      continue;
    }
    const industry = industryBestWindows(platform, outputType);
    const suggested = suggestedChicagoIso(industry.windows, now);
    const iso = nextOpenScheduleIso(suggested, reserved[platform] || []);
    stamps.set(key, iso);
    (reserved[platform] ||= []).push(Date.parse(iso));
  }
  return stamps;
}
