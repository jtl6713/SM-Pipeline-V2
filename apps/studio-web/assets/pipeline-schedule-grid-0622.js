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

  function dayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function sevenDayWindow(nowValue) {
    const now = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue || Date.now());
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
    return { now, start, end, days };
  }

  function platformCode(platform) {
    const key = String(platform || "").trim().toLowerCase();
    if (PLATFORM_CODES[key]) return PLATFORM_CODES[key];
    return key ? key.slice(0, 2).toUpperCase() : "??";
  }

  function cellKey(date) {
    return `${dayKey(date)}-${pad(date.getHours())}`;
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
      const key = cellKey(when);
      const platform = String(record?.platform || "Other").trim() || "Other";
      const current = cells.get(key) || { total: 0, platforms: {}, records: [] };
      current.total += 1;
      current.platforms[platform] = (current.platforms[platform] || 0) + 1;
      current.records.push(record);
      cells.set(key, current);
    }
    return cells;
  }

  root.PipelineScheduleGrid = {
    dayKey,
    sevenDayWindow,
    platformCode,
    cellKey,
    aggregate,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
