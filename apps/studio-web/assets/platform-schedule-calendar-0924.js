(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_WARNING_MS = 3 * 60 * 60 * 1000;

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
      hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), weekday: parts.find((part) => part.type === "weekday")?.value || "" };
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

  function localDayKey(date, timeZone = "") {
    const value = date instanceof Date ? date : new Date(date);
    const zone = normalizeTimeZone(timeZone);
    const parts = zone ? zonedParts(value, zone) : {
      year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(),
    };
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function addLocalDays(value, amount, timeZone = "") {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    const zone = normalizeTimeZone(timeZone);
    if (!zone) {
      date.setDate(date.getDate() + Number(amount || 0));
      return date;
    }
    const local = zonedParts(date, zone);
    const civil = addCivilDays(local.year, local.month, local.day, Number(amount || 0));
    return new Date(zonedWallToUtcMs(civil.year, civil.month, civil.day, 0, 0, zone));
  }

  function startOfLocalWeek(value, weekStartsOn = 0, timeZone = "") {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    const zone = normalizeTimeZone(timeZone);
    if (!zone) {
      date.setHours(0, 0, 0, 0);
      const offset = (date.getDay() - weekStartsOn + 7) % 7;
      date.setDate(date.getDate() - offset);
      return date;
    }
    const local = zonedParts(date, zone);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday = Math.max(0, weekdays.indexOf(local.weekday));
    const offset = (weekday - weekStartsOn + 7) % 7;
    const civil = addCivilDays(local.year, local.month, local.day, -offset);
    return new Date(zonedWallToUtcMs(civil.year, civil.month, civil.day, 0, 0, zone));
  }

  function weekContaining(value, weekStartsOn = 0, timeZone = "") {
    const start = startOfLocalWeek(value, weekStartsOn, timeZone);
    const end = addLocalDays(start, 7, timeZone);
    const days = Array.from({ length: 7 }, (_, index) => addLocalDays(start, index, timeZone));
    return { start, end, days, timeZone: normalizeTimeZone(timeZone) };
  }

  function sevenDayWindow(value, timeZone = "") {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    const zone = normalizeTimeZone(timeZone);
    let start;
    if (zone) {
      const local = zonedParts(date, zone);
      start = new Date(zonedWallToUtcMs(local.year, local.month, local.day, 0, 0, zone));
    } else {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
    }
    const end = addLocalDays(start, 7, zone);
    const days = Array.from({ length: 7 }, (_, index) => addLocalDays(start, index, zone));
    return { start, end, days, timeZone: zone };
  }

  function defaultWeek(nowValue, timeZone = "") {
    const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue || Date.now());
    return sevenDayWindow(now, timeZone);
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
    return `${localDayKey(date)}-${pad(date.getHours())}-${pad(minutes)}`;
  }

  function recordsForPlatform(records, platform, excludeId = "") {
    const wanted = String(platform || "").trim().toLowerCase();
    const excluded = String(excludeId || "").trim();
    return (Array.isArray(records) ? records : []).filter((record) => {
      if (!record || String(record.id || "").trim() === excluded) return false;
      if (String(record.platform || "").trim().toLowerCase() !== wanted) return false;
      const stamp = Date.parse(record.scheduled_post_date || "");
      return Number.isFinite(stamp);
    });
  }

  function aggregateBySlot(records, platform, excludeId = "", timeZone = "") {
    const slots = new Map();
    for (const record of recordsForPlatform(records, platform, excludeId)) {
      const key = slotKey(new Date(record.scheduled_post_date), timeZone);
      const current = slots.get(key) || [];
      current.push(record);
      current.sort((left, right) => Date.parse(left.scheduled_post_date) - Date.parse(right.scheduled_post_date));
      slots.set(key, current);
    }
    return slots;
  }

  function minutesLabel(minutes) {
    const rounded = Math.max(0, Math.round(minutes));
    if (rounded < 60) return `${rounded} minute${rounded === 1 ? "" : "s"}`;
    const hours = rounded / 60;
    const display = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
    return `${display} hour${hours === 1 ? "" : "s"}`;
  }

  function spacingWarning(candidateValue, records, platform, excludeId = "", warningMs = DEFAULT_WARNING_MS) {
    const candidate = candidateValue instanceof Date ? candidateValue : new Date(candidateValue);
    const candidateMs = candidate.getTime();
    if (!Number.isFinite(candidateMs)) return null;
    let nearest = null;
    for (const record of recordsForPlatform(records, platform, excludeId)) {
      const recordMs = Date.parse(record.scheduled_post_date || "");
      const distanceMs = Math.abs(candidateMs - recordMs);
      if (distanceMs >= Number(warningMs || DEFAULT_WARNING_MS)) continue;
      if (!nearest || distanceMs < nearest.distanceMs) nearest = { record, recordMs, distanceMs };
    }
    if (!nearest) return null;
    const differenceMinutes = Math.round((candidateMs - nearest.recordMs) / 60000);
    const relationship = differenceMinutes === 0
      ? "at the same time"
      : differenceMinutes > 0
        ? `${minutesLabel(Math.abs(differenceMinutes))} earlier`
        : `${minutesLabel(Math.abs(differenceMinutes))} later`;
    const platformName = String(platform || "Platform").trim() || "Platform";
    return {
      record: nearest.record,
      distance_ms: nearest.distanceMs,
      message: `Another ${platformName} post is scheduled ${relationship}.`,
    };
  }

  function inWindow(value, windowValue) {
    const stamp = value instanceof Date ? value.getTime() : Date.parse(value || "");
    return Number.isFinite(stamp)
      && stamp >= windowValue.start.getTime()
      && stamp < windowValue.end.getTime();
  }

  root.PlatformScheduleCalendar = {
    DAY_MS,
    DEFAULT_WARNING_MS,
    addLocalDays,
    aggregateBySlot,
    defaultWeek,
    inWindow,
    localDayKey,
    recordsForPlatform,
    slotDate,
    slotKey,
    spacingWarning,
    startOfLocalWeek,
    sevenDayWindow,
    weekContaining,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
