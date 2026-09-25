(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_WARNING_MS = 3 * 60 * 60 * 1000;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function localDayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addLocalDays(value, amount) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    date.setDate(date.getDate() + Number(amount || 0));
    return date;
  }

  function startOfLocalWeek(value, weekStartsOn = 0) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    date.setHours(0, 0, 0, 0);
    const offset = (date.getDay() - weekStartsOn + 7) % 7;
    date.setDate(date.getDate() - offset);
    return date;
  }

  function weekContaining(value, weekStartsOn = 0) {
    const start = startOfLocalWeek(value, weekStartsOn);
    const end = addLocalDays(start, 7);
    const days = Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
    return { start, end, days };
  }

  function sevenDayWindow(value) {
    const start = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    start.setHours(0, 0, 0, 0);
    const end = addLocalDays(start, 7);
    const days = Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
    return { start, end, days };
  }

  function defaultWeek(nowValue) {
    const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue || Date.now());
    return sevenDayWindow(now);
  }

  function slotDate(day, slotIndex) {
    const date = day instanceof Date ? new Date(day.getTime()) : new Date(day);
    date.setHours(0, Number(slotIndex || 0) * 30, 0, 0);
    return date;
  }

  function slotKey(value) {
    const date = value instanceof Date ? value : new Date(value);
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

  function aggregateBySlot(records, platform, excludeId = "") {
    const slots = new Map();
    for (const record of recordsForPlatform(records, platform, excludeId)) {
      const key = slotKey(new Date(record.scheduled_post_date));
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
