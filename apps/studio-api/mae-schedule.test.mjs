import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAE_PRIORITY_SCHEDULE_WINDOWS,
  MAE_SUGGEST_HORIZON_DAYS,
  MAE_SCHEDULE_HORIZON_SETTING,
  maeBuildSuggestedScheduleMap,
  maeIsBlackoutLocalTime,
  maeNextOpenScheduleIso,
  maeNormalizeHorizonDays,
  maePickBalancedSuggestedIso,
  maeResolveStorySchedule,
  maeScheduleLaneKey,
  maeScheduleNextSlot,
  maeSortRegenCombinations,
  maeTimeZoneFromTheme,
  maeZonedWallToUtcMs,
} from "./mae-schedule.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

function localParts(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

function dayOf(iso, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

function fillMaeHorizon(zone, startCivil, days = MAE_SUGGEST_HORIZON_DAYS) {
  const occupied = [];
  for (let offset = 0; offset < days; offset++) {
    const utc = Date.UTC(startCivil.year, startCivil.month - 1, startCivil.day) + offset * 86400000;
    const d = new Date(utc);
    const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    for (const [hh, mm] of [[5, 0], [10, 30], [16, 0]]) {
      occupied.push(maeZonedWallToUtcMs(civil.year, civil.month, civil.day, hh, mm, zone));
    }
  }
  return occupied;
}

test("nyc and miami map to America/New_York", () => {
  assert.equal(maeTimeZoneFromTheme("nyc"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("miami"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("la"), "America/Los_Angeles");
});

test("horizon defaults to 30 days and is configurable", () => {
  assert.equal(MAE_SUGGEST_HORIZON_DAYS, 30);
  assert.equal(MAE_SCHEDULE_HORIZON_SETTING, "STUDIO_SCHEDULE_HORIZON_DAYS");
  assert.equal(maeNormalizeHorizonDays(14), 14);
  assert.equal(maeNormalizeHorizonDays(0), 30);
  assert.equal(maeNormalizeHorizonDays(200), 90);
});

test("MAE windows are 5:00, 10:30, and 16:00", () => {
  assert.deepEqual([...MAE_PRIORITY_SCHEDULE_WINDOWS], [
    "05:00-07:00",
    "10:30-12:30",
    "16:00-18:00",
  ]);
});

test("empty schedule first post is Day 1 Morning", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z"); // 3:00 AM CDT
  const iso = maePickBalancedSuggestedIso([], now, { timeZone: zone, occupiedMs: [] });
  assert.equal(dayOf(iso, zone), "2026-10-05");
  assert.deepEqual(localParts(iso, zone), { hour: 5, minute: 0 });
});

test("second and third posts fill Day 1 Afternoon then Evening", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
  }
  assert.equal(dayOf(picks[0], zone), "2026-10-05");
  assert.deepEqual(localParts(picks[0], zone), { hour: 5, minute: 0 });
  assert.deepEqual(localParts(picks[1], zone), { hour: 10, minute: 30 });
  assert.deepEqual(localParts(picks[2], zone), { hour: 16, minute: 0 });
});

test("fourth post is Day 2 Morning", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = [];
  for (let i = 0; i < 4; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
    });
    occupied.push(Date.parse(iso));
    if (i === 3) {
      assert.equal(dayOf(iso, zone), "2026-10-06");
      assert.deepEqual(localParts(iso, zone), { hour: 5, minute: 0 });
    }
  }
});

test("90 MAE posts fill all 30 days with three each", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = [];
  const byDay = new Map();
  for (let i = 0; i < 90; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      horizonDays: 30,
    });
    assert.ok(iso, `post ${i + 1}`);
    occupied.push(Date.parse(iso));
    const day = dayOf(iso, zone);
    byDay.set(day, (byDay.get(day) || 0) + 1);
    const local = localParts(iso, zone);
    assert.ok(
      (local.hour === 5 && local.minute === 0)
      || (local.hour === 10 && local.minute === 30)
      || (local.hour === 16 && local.minute === 0),
      `off MAE: ${iso}`,
    );
  }
  assert.equal(byDay.size, 30);
  for (const count of byDay.values()) assert.equal(count, 3);
});

test("91st post is Day 1 widest valid gap; 92nd is Day 2", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 5 }, 30);
  const first = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
    horizonDays: 30,
  });
  assert.equal(dayOf(first, zone), "2026-10-05");
  const firstLocal = localParts(first, zone);
  assert.ok(!(firstLocal.hour === 5 && firstLocal.minute === 0));
  assert.ok(!(firstLocal.hour === 10 && firstLocal.minute === 30));
  assert.ok(!(firstLocal.hour === 16 && firstLocal.minute === 0));

  const second = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: [...occupied, Date.parse(first)],
    platformOccupiedMs: [...occupied, Date.parse(first)],
    horizonDays: 30,
  });
  assert.equal(dayOf(second, zone), "2026-10-06");
});

test("120th post is Day 30 overflow; 121st returns to Day 1", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 3 }, 30);
  // Seed one overflow on every day first (posts 91–120).
  const extras = [];
  for (let i = 0; i < 30; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: [...occupied, ...extras.map(Date.parse)],
      platformOccupiedMs: [...occupied, ...extras.map(Date.parse)],
      horizonDays: 30,
    });
    extras.push(iso);
  }
  assert.equal(dayOf(extras[29], zone), "2026-11-01");
  const next = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: [...occupied, ...extras.map(Date.parse)],
    platformOccupiedMs: [...occupied, ...extras.map(Date.parse)],
    horizonDays: 30,
  });
  assert.equal(dayOf(next, zone), "2026-10-03");
});

test("uneven daily counts prefer earliest least-populated day", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  // Day 1 has 5 posts, days 2–30 have 3 MAE each.
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 5 }, 30);
  occupied.push(maeZonedWallToUtcMs(2026, 10, 5, 8, 0, zone));
  occupied.push(maeZonedWallToUtcMs(2026, 10, 5, 12, 0, zone));
  const iso = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
    horizonDays: 30,
  });
  assert.equal(dayOf(iso, zone), "2026-10-06");
});

test("Facebook Reel lane does not consume Facebook Story slot", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const storyLane = [
    maeZonedWallToUtcMs(2026, 10, 5, 5, 0, zone),
    maeZonedWallToUtcMs(2026, 10, 5, 10, 30, zone),
    maeZonedWallToUtcMs(2026, 10, 5, 16, 0, zone),
  ];
  const reel = maeScheduleNextSlot({
    timeZone: zone,
    now,
    occupiedMs: [],
    horizonDays: 30,
  });
  assert.equal(reel.ok, true);
  assert.equal(dayOf(reel.iso, zone), "2026-10-05");
  assert.deepEqual(localParts(reel.iso, zone), { hour: 5, minute: 0 });
  // Story lane full on day 1 must not push the Reel off morning.
  assert.equal(maeScheduleLaneKey("Facebook", "Reel"), "facebook::reel");
  assert.equal(maeScheduleLaneKey("Facebook", "Story"), "facebook::story");
  assert.notEqual(maeScheduleLaneKey("Facebook", "Reel"), maeScheduleLaneKey("Facebook", "Story"));
  void storyLane;
});

test("horizon of 14 days is honored for subsequent scheduling", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 5 }, 14);
  const iso = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
    horizonDays: 14,
  });
  assert.equal(dayOf(iso, zone), "2026-10-05");
  const beyond = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
    horizonDays: 14,
  });
  // Overflow stays inside 14 days.
  assert.ok(dayOf(beyond, zone) <= "2026-10-18");
});

test("current-day past windows are skipped", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T14:00:00Z"); // 10:00 AM EDT — morning past
  const iso = maePickBalancedSuggestedIso([], now, { occupiedMs: [], timeZone: zone });
  assert.equal(dayOf(iso, zone), "2026-10-06");
  assert.deepEqual(localParts(iso, zone), { hour: 10, minute: 30 });
});

test("blackout is 8:00 PM through 3:30 AM", () => {
  const zone = "America/New_York";
  const eightPm = maeZonedWallToUtcMs(2026, 10, 8, 20, 0, zone);
  const sevenFiftyNine = maeZonedWallToUtcMs(2026, 10, 8, 19, 59, zone);
  const threeThirty = maeZonedWallToUtcMs(2026, 10, 9, 3, 30, zone);
  const threeThirtyOne = maeZonedWallToUtcMs(2026, 10, 9, 3, 31, zone);
  assert.equal(maeIsBlackoutLocalTime(eightPm, zone), true);
  assert.equal(maeIsBlackoutLocalTime(sevenFiftyNine, zone), false);
  assert.equal(maeIsBlackoutLocalTime(threeThirty, zone), true);
  assert.equal(maeIsBlackoutLocalTime(threeThirtyOne, zone), false);
});

test("daylight saving transition uses profile-local wall time", () => {
  const zone = "America/New_York";
  // US DST ends 2026-11-01. Schedule from before/after using local walls.
  const before = maeZonedWallToUtcMs(2026, 10, 31, 5, 0, zone);
  const after = maeZonedWallToUtcMs(2026, 11, 2, 5, 0, zone);
  assert.equal(localParts(new Date(before).toISOString(), zone).hour, 5);
  assert.equal(localParts(new Date(after).toISOString(), zone).hour, 5);
  const now = new Date("2026-10-31T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 31 }, 3);
  const iso = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
    horizonDays: 3,
  });
  assert.ok(iso);
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("capacity failure returns explicit error", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 5 }, 1);
  // Saturate open hours every 45 minutes so no 90-minute-clear gap remains.
  for (let minute = 3 * 60 + 31; minute <= 19 * 60 + 59; minute += 45) {
    const hh = Math.floor(minute / 60);
    const mm = minute % 60;
    occupied.push(maeZonedWallToUtcMs(2026, 10, 5, hh, mm, zone));
  }
  const result = maeScheduleNextSlot({
    timeZone: zone,
    now,
    occupiedMs: occupied,
    horizonDays: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.capacity, true);
  assert.match(result.error, /No open/i);
});

test("keepAnyNonClashing preserves a saved future non-MAE stamp", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T18:00:00Z");
  const saved = "2026-10-19T18:30:00.000Z"; // Oct 19 2:30 PM EDT (inside open hours)
  const kept = maeNextOpenScheduleIso(saved, [], undefined, {
    timeZone: zone,
    now,
    keepAnyNonClashing: true,
  });
  assert.equal(kept, new Date(saved).toISOString());
});

test("regeneration combination sort is platform, output type, profile", () => {
  const sorted = maeSortRegenCombinations([
    { platform: "TikTok", output_type: "Video", profile: "Chicago" },
    { platform: "Facebook", output_type: "Story", profile: "Miami" },
    { platform: "Facebook", output_type: "Reel", profile: "Chicago" },
    { platform: "Facebook", output_type: "Reel", profile: "Atlanta" },
    { platform: "Instagram", output_type: "Reel", profile: "Chicago" },
  ]);
  assert.deepEqual(
    sorted.map((row) => `${row.platform}/${row.output_type}/${row.profile}`),
    [
      "Facebook/Reel/Atlanta",
      "Facebook/Reel/Chicago",
      "Facebook/Story/Miami",
      "Instagram/Reel/Chicago",
      "TikTok/Video/Chicago",
    ],
  );
});

test("build map schedules Reel and Story on independent lanes", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-05T08:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Facebook", output_type: "Reel", scheduled_at: "" },
      { platform: "Facebook", output_type: "Story", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone, storyCompanion: false, spreadPlatforms: false },
  );
  const reel = stamps.get("Facebook::Reel");
  const story = stamps.get("Facebook::Story");
  assert.ok(reel);
  assert.ok(story);
  // Independent lanes may share the same MAE wall clock.
  assert.equal(dayOf(reel, zone), dayOf(story, zone));
  assert.deepEqual(localParts(reel, zone), localParts(story, zone));
});

test("Approve resolves a Story to the same-platform main plus 10 minutes when companion present", () => {
  const zone = "America/New_York";
  const notBefore = Date.parse("2026-10-14T16:00:00Z");
  const reelMs = maeZonedWallToUtcMs(2026, 10, 27, 16, 0, zone);
  const resolved = maeResolveStorySchedule({
    platform: "Instagram",
    siblings: [
      { platform: "Instagram", output_type: "Reel", scheduled_at: new Date(reelMs).toISOString() },
    ],
    notBeforeMs: notBefore,
    timeZone: zone,
  });
  assert.equal(resolved.source, "companion");
  assert.equal(Date.parse(resolved.iso), reelMs + 10 * 60 * 1000);
});

test("Worker stamp paths use MAE horizon engine", () => {
  assert.match(worker, /from "\.\/mae-schedule\.mjs"/);
  assert.match(worker, /studio_mae_schedule_v1: true/);
  assert.match(worker, /studio_mae_horizon_days_v1: true/);
  assert.match(worker, /studio_mae_output_type_lanes_v1: true/);
  assert.match(worker, /studio_mae_profile_occupancy_v1: true/);
  assert.match(worker, /0.10.621-approve-binding-dirty/);
  assert.match(worker, /MAE_PRIORITY_SCHEDULE_WINDOWS/);
  assert.match(worker, /maeScheduleLaneKey/);
  assert.match(worker, /STUDIO_SCHEDULE_HORIZON_DAYS|MAE_SCHEDULE_HORIZON_SETTING/);
  assert.match(worker, /studioScheduleHorizonDays/);
  const approveFn = worker.slice(
    worker.indexOf("async function approveOutputRecordForPublishing"),
    worker.indexOf("function mapApprovedOutputSummary"),
  );
  assert.match(approveFn, /recheckBestSlot/);
  assert.match(worker, /SCHEDULE_REGEN_JOBS|schedule-regen/);
});

test("occupancy load windows the Airtable query and sorts nearest-first", () => {
  const loadFn = worker.slice(
    worker.indexOf("async function studioLoadOccupiedScheduleRows"),
    worker.indexOf("async function studioLoadOccupiedSchedules"),
  );
  assert.match(loadFn, /sortDirection: "asc"/);
  assert.match(loadFn, /studioOccupiedFilterFormula\(now, profile\)/);
  assert.match(loadFn, /"Studio_Output_Type"/);
  assert.match(loadFn, /"Content_Profile"/);
  const occupyFn = worker.slice(
    worker.indexOf("async function studioLoadOccupiedSchedules"),
    worker.indexOf("function studioPublishScheduleFields"),
  );
  assert.match(occupyFn, /maeScheduleLaneKey/);
});
