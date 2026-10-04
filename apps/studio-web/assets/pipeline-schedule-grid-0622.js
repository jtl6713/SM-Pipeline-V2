(function (root) {
  "use strict";

  const PLATFORM_CODES = {
    instagram: "IG",
    facebook: "FB",
    tiktok: "TT",
    youtube: "YT",
  };

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeTimeZone(timeZone) {
    if (!timeZone) return "";
    try { new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date()); return String(timeZone); }
    catch { return ""; }
  }

  function zonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
  }

  function zonedWallToUtcMs(year, month, day, hour, minute, timeZone) {
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let stamp = wanted;
    for (let attempt = 0; attempt < 8; attempt++) {
      const got = zonedParts(new Date(stamp), timeZone);
      const represented = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, 0, 0);
      const delta = wanted - represented;
      if (!delta) return stamp;
      stamp += delta;
    }
    return stamp;
  }

  function addCivilDays(year, month, day, amount) {
    const value = new Date(Date.UTC(year, month - 1, day + amount));
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
  }

  function dayKey(date, timeZone = "") {
    const value = date instanceof Date ? date : new Date(date);
    const zone = normalizeTimeZone(timeZone);
    const parts = zone ? zonedParts(value, zone) : {
      year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(),
    };
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function sevenDayWindow(nowValue, timeZone = "") {
    const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue || Date.now());
    const zone = normalizeTimeZone(timeZone);
    if (!zone) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
      });
      return { now, start, end, days, timeZone: "" };
    }
    const local = zonedParts(now, zone);
    const start = new Date(zonedWallToUtcMs(local.year, local.month, local.day, 0, 0, zone));
    const endCivil = addCivilDays(local.year, local.month, local.day, 7);
    const end = new Date(zonedWallToUtcMs(endCivil.year, endCivil.month, endCivil.day, 0, 0, zone));
    const days = Array.from({ length: 7 }, (_, index) => {
      const civil = addCivilDays(local.year, local.month, local.day, index);
      return new Date(zonedWallToUtcMs(civil.year, civil.month, civil.day, 0, 0, zone));
    });
    return { now, start, end, days, timeZone: zone };
  }

  function addDays(dateValue, amount, timeZone = "") {
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    const zone = normalizeTimeZone(timeZone);
    if (!zone) {
      date.setDate(date.getDate() + Number(amount || 0));
      return date;
    }
    const local = zonedParts(date, zone);
    const civil = addCivilDays(local.year, local.month, local.day, Number(amount || 0));
    return new Date(zonedWallToUtcMs(civil.year, civil.month, civil.day, 0, 0, zone));
  }

  function platformCode(platform) {
    const key = String(platform || "").trim().toLowerCase();
    if (PLATFORM_CODES[key]) return PLATFORM_CODES[key];
    return key ? key.slice(0, 2).toUpperCase() : "??";
  }

  function slotDate(day, slotIndex, timeZone = "") {
    const date = day instanceof Date ? new Date(day.getTime()) : new Date(day);
    const zone = normalizeTimeZone(timeZone);
    if (!zone) {
      date.setHours(0, Number(slotIndex || 0) * 30, 0, 0);
      return date;
    }
    const local = zonedParts(date, zone);
    const totalMinutes = Number(slotIndex || 0) * 30;
    const civil = addCivilDays(local.year, local.month, local.day, Math.floor(totalMinutes / 1440));
    const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
    return new Date(zonedWallToUtcMs(civil.year, civil.month, civil.day,
      Math.floor(minuteOfDay / 60), minuteOfDay % 60, zone));
  }

  function slotKey(value, timeZone = "") {
    const date = value instanceof Date ? value : new Date(value);
    const zone = normalizeTimeZone(timeZone);
    if (zone) {
      const local = zonedParts(date, zone);
      const minutes = local.minute < 30 ? 0 : 30;
      return `${local.year}-${pad(local.month)}-${pad(local.day)}-${pad(local.hour)}-${pad(minutes)}`;
    }
    const minutes = date.getMinutes() < 30 ? 0 : 30;
    return `${dayKey(date)}-${pad(date.getHours())}-${pad(minutes)}`;
  }

  function cellKey(value) {
    return slotKey(value);
  }

  function aggregate(records, windowValue) {
    const window = windowValue || sevenDayWindow(new Date());
    const cells = new Map();
    const startMs = (window.now instanceof Date ? window.now : window.start).getTime();
    const endMs = window.end.getTime();
    for (const record of Array.isArray(records) ? records : []) {
      const raw = String(record?.scheduled_post_date || "").trim();
      const when = new Date(raw);
      const stamp = when.getTime();
      if (!raw || !Number.isFinite(stamp) || stamp < startMs || stamp >= endMs) continue;
      const key = slotKey(when, window.timeZone || "");
      const platform = String(record?.platform || "Other").trim() || "Other";
      const current = cells.get(key) || { total: 0, platforms: {}, records: [] };
      current.total += 1;
      current.platforms[platform] = (current.platforms[platform] || 0) + 1;
      current.records.push(record);
      current.records.sort((left, right) => Date.parse(left.scheduled_post_date || "") - Date.parse(right.scheduled_post_date || ""));
      cells.set(key, current);
    }
    return cells;
  }

  root.PipelineScheduleGrid = {
    dayKey,
    sevenDayWindow,
    addDays,
    platformCode,
    slotDate,
    slotKey,
    cellKey,
    aggregate,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
