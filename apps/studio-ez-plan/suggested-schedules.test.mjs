import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIORITY_SCHEDULE_WINDOWS,
  SUGGESTED_HORIZON_DAYS,
  addCivilDays,
  buildSuggestedScheduleMap,
  chicagoDateTimeParts,
  chicagoWallToUtcMs,
  civilKey,
  isBlackoutLocalTime,
  listHorizonCivils,
  nextOpenScheduleIso,
  pickBalancedSuggestedIso,
  planScheduleItems,
  sanitizeScheduleWindows,
  suggestedChicagoIso,
} from "./suggested-schedules.mjs";

const NOW = new Date("2026-10-03T08:00:00Z");

function localParts(iso, timeZone = "America/Chicago") {
  const parts = chicagoDateTimeParts(new Date(iso), timeZone);
  return { hour: parts.hour, minute: parts.minute, key: civilKey(parts.year, parts.month, parts.day) };
}

test("automatic suggestions start in the morning priority window", () => {
  const iso = suggestedChicagoIso([], NOW, { timeZone: "America/Chicago" });
  const local = localParts(iso);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(isBlackoutLocalTime(Date.parse(iso)), false);
});

test("scheduler exhausts days 1-7 morning before midday, then afternoon", () => {
  const firstSevenMornings = [];
  for (let day = 3; day <= 9; day++) {
    firstSevenMornings.push(chicagoWallToUtcMs(2026, 10, day, 5, 30));
  }
  const midday = pickBalancedSuggestedIso([], NOW, {
    platformOccupiedMs: firstSevenMornings,
    timeZone: "America/Chicago",
  });
  assert.deepEqual(localParts(midday), { hour: 11, minute: 30, key: "2026-10-03" });

  const firstSevenMidday = [];
  for (let day = 3; day <= 9; day++) {
    firstSevenMidday.push(chicagoWallToUtcMs(2026, 10, day, 11, 30));
  }
  const afternoon = pickBalancedSuggestedIso([], NOW, {
    platformOccupiedMs: [...firstSevenMornings, ...firstSevenMidday],
    timeZone: "America/Chicago",
  });
  assert.equal(localParts(afternoon).hour, 16);
  assert.equal(localParts(afternoon).minute, 30);
});

test("days 8-14 morning only after first-week morning/midday/afternoon are full", () => {
  const occupied = [];
  for (let day = 3; day <= 9; day++) {
    occupied.push(chicagoWallToUtcMs(2026, 10, day, 5, 30));
    occupied.push(chicagoWallToUtcMs(2026, 10, day, 11, 30));
    occupied.push(chicagoWallToUtcMs(2026, 10, day, 16, 30));
  }
  const iso = pickBalancedSuggestedIso([], NOW, {
    platformOccupiedMs: occupied,
    timeZone: "America/Chicago",
  });
  const local = localParts(iso);
  assert.equal(local.key, "2026-10-10");
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
});

test("overnight heatmap windows are stripped before scheduling", () => {
  assert.deepEqual(
    sanitizeScheduleWindows(["22:00-00:00", "00:00-06:00", "11:00-13:00"]),
    ["11:00-13:00"],
  );
  assert.deepEqual(sanitizeScheduleWindows(["22:00-00:00"]), [...PRIORITY_SCHEDULE_WINDOWS]);
});

test("industry overnight windows cannot produce 11:30 PM or 2:30 AM stamps", () => {
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 12; i++) {
    const iso = pickBalancedSuggestedIso(["22:00-00:00", "00:00-06:00", "19:00-21:00"], NOW, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: "America/Chicago",
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
  }
  for (const iso of picks) {
    const local = localParts(iso);
    assert.equal(isBlackoutLocalTime(Date.parse(iso)), false, iso);
    assert.ok(local.hour >= 4 && local.hour < 20, `blackout-adjacent hour ${local.hour} from ${iso}`);
    assert.notEqual(`${local.hour}:${local.minute}`, "23:30");
    assert.notEqual(`${local.hour}:${local.minute}`, "2:30");
  }
});

test("conflict fallback advances out of overnight blackout", () => {
  const candidate = "2026-10-04T02:00:00Z"; // 9:00 PM CDT previous evening? wait 02:00Z = 9 PM CDT Oct 3
  const occupied = [Date.parse(candidate)];
  const iso = nextOpenScheduleIso(candidate, occupied, 3 * 60 * 60 * 1000, { timeZone: "America/Chicago" });
  const local = localParts(iso);
  assert.equal(isBlackoutLocalTime(Date.parse(iso)), false);
  assert.ok(local.hour >= 4 && local.hour < 20);
});

test("buildSuggestedScheduleMap replaces blackout existing stamps", () => {
  const stamps = buildSuggestedScheduleMap([
    { platform: "Instagram", output_type: "Reel", scheduled_at: "2026-10-12T04:30:00.000Z" }, // 11:30 PM CDT
    { platform: "Instagram", output_type: "Story" },
  ], {}, NOW, { timeZone: "America/Chicago" });
  const reel = stamps.get("Instagram::Reel");
  const story = stamps.get("Instagram::Story");
  assert.notEqual(reel, "2026-10-12T04:30:00.000Z");
  assert.equal(isBlackoutLocalTime(Date.parse(reel)), false);
  assert.equal(isBlackoutLocalTime(Date.parse(story)), false);
  assert.ok(Math.abs(Date.parse(story) - Date.parse(reel)) >= 3 * 60 * 60 * 1000);
});

test("vertical video stamps stay in the 14-day horizon and never blackout", () => {
  const items = planScheduleItems({
    items: [
      { platform: "Instagram", output_type: "Reel" },
      { platform: "Facebook", output_type: "Reel" },
      { platform: "TikTok", output_type: "Video Draft" },
      { platform: "YouTube", output_type: "Short" },
    ],
    extras: ["Instagram::Story", "Facebook::Story"],
  });
  const stamps = buildSuggestedScheduleMap(items, {}, NOW, { timeZone: "America/Chicago" });
  const horizon = new Set(listHorizonCivils(NOW).map((day) => day.key));
  assert.equal(SUGGESTED_HORIZON_DAYS, 14);
  for (const iso of stamps.values()) {
    assert.ok(Date.parse(iso) > NOW.getTime());
    assert.ok(horizon.has(localParts(iso).key), `outside 14-day horizon: ${iso}`);
    assert.equal(isBlackoutLocalTime(Date.parse(iso)), false);
  }
});

test("same-platform posts prefer different days before stacking the same morning", () => {
  const first = suggestedChicagoIso([], NOW, { timeZone: "America/Chicago" });
  const second = suggestedChicagoIso([], NOW, {
    occupiedMs: [Date.parse(first)],
    platformOccupiedMs: [Date.parse(first)],
    timeZone: "America/Chicago",
  });
  assert.notEqual(localParts(second).key, localParts(first).key);
  assert.equal(localParts(second).hour, 5);
  assert.equal(localParts(second).minute, 30);
});

test("horizon helper returns 14 civil days", () => {
  const days = listHorizonCivils(NOW);
  assert.equal(days.length, 14);
  assert.equal(days[0].key, "2026-10-03");
  const last = addCivilDays(2026, 10, 3, 13);
  assert.equal(days[13].key, civilKey(last.year, last.month, last.day));
});
