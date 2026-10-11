import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAE_PRIORITY_SCHEDULE_WINDOWS,
  MAE_SUGGEST_HORIZON_DAYS,
  maeBuildSuggestedScheduleMap,
  maeIsBlackoutLocalTime,
  maeNextOpenScheduleIso,
  maePickBalancedSuggestedIso,
  maeTimeZoneFromTheme,
  maeZonedWallToUtcMs,
} from "./mae-schedule.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

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
    for (const [hh, mm] of [[5, 30], [11, 30], [16, 30]]) {
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

test("horizon is 28 days", () => {
  assert.equal(MAE_SUGGEST_HORIZON_DAYS, 28);
});

test("MAE never stamps NYC midnight or 11 PM for YouTube/Instagram", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 12; i++) {
    const iso = maePickBalancedSuggestedIso([], now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
    assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false, iso);
    const local = localParts(iso, zone);
    assert.ok(
      (local.hour === 5 && local.minute === 30)
      || (local.hour === 11 && local.minute === 30)
      || (local.hour === 16 && local.minute === 30),
      `off MAE: ${iso} ${local.hour}:${String(local.minute).padStart(2, "0")}`,
    );
  }
  const hours = picks.map((iso) => localParts(iso, zone).hour);
  assert.ok(!hours.includes(0) && !hours.includes(1) && !hours.includes(23) && !hours.includes(22), hours.join(","));
});

test("Worker MAE fills morning then afternoon then evening before the next day's MAE", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const occupied = [];
  const locals = [];
  const days = [];
  for (let i = 0; i < 4; i++) {
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    locals.push(localParts(iso, zone));
    days.push(dayOf(iso, zone));
    occupied.push(Date.parse(iso));
  }
  assert.deepEqual(locals.slice(0, 3).map((part) => `${part.hour}:${String(part.minute).padStart(2, "0")}`), [
    "5:30",
    "11:30",
    "16:30",
  ]);
  assert.equal(locals[3].hour, 5);
  assert.equal(locals[3].minute, 30);
  assert.equal(days[0], days[2]);
  assert.notEqual(days[3], days[0]);
});

test("two TikToks take Monday morning then Monday afternoon, not two mornings", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z"); // 4:00 AM EDT Monday
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "TikTok", output_type: "Video Draft", scheduled_at: "" },
      { platform: "TikTok", output_type: "Multi-Photo", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone },
  );
  const first = localParts(stamps.get("TikTok::Video Draft"), zone);
  const second = localParts(stamps.get("TikTok::Multi-Photo"), zone);
  assert.equal(first.hour, 5);
  assert.equal(first.minute, 30);
  assert.equal(second.hour, 11);
  assert.equal(second.minute, 30);
  assert.equal(dayOf(stamps.get("TikTok::Video Draft"), zone), dayOf(stamps.get("TikTok::Multi-Photo"), zone));
});

test("blackout 12 AM NY is replaced with the next MAE slot, not +3h", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z"); // 4:00 AM EDT, so 5:30 is still open
  const midnight = "2026-10-09T04:00:00.000Z"; // 12:00 AM EDT
  assert.equal(maeIsBlackoutLocalTime(Date.parse(midnight), zone), true);
  const iso = maeNextOpenScheduleIso(midnight, [], undefined, { timeZone: zone, now });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("keepAnyNonClashing preserves a saved future non-MAE-adjacent stamp", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T18:00:00Z");
  const saved = "2026-10-19T20:30:00.000Z"; // Oct 19 4:30 PM EDT
  const kept = maeNextOpenScheduleIso(saved, [], undefined, {
    timeZone: zone,
    now,
    keepAnyNonClashing: true,
  });
  assert.equal(kept, new Date(saved).toISOString());
});

test("taken evening forces the next morning instead of reusing 4:30 PM", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T18:00:00Z");
  const occupied = [
    Date.parse("2026-10-06T09:30:00.000Z"),
    Date.parse("2026-10-06T15:30:00.000Z"),
    Date.parse("2026-10-06T20:30:00.000Z"),
    Date.parse("2026-10-06T21:00:00.000Z"),
  ];
  const iso = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(dayOf(iso, zone), "2026-10-07");
});

test("11 PM profile local is blackout; 10:59 PM is not", () => {
  const zone = "America/New_York";
  const eleven = maeZonedWallToUtcMs(2026, 10, 8, 23, 0, zone);
  const tenFiftyNine = maeZonedWallToUtcMs(2026, 10, 8, 22, 59, zone);
  const threeAm = maeZonedWallToUtcMs(2026, 10, 9, 3, 0, zone);
  const threeOhOne = maeZonedWallToUtcMs(2026, 10, 9, 3, 1, zone);
  assert.equal(maeIsBlackoutLocalTime(eleven, zone), true);
  assert.equal(maeIsBlackoutLocalTime(tenFiftyNine, zone), false);
  assert.equal(maeIsBlackoutLocalTime(threeAm, zone), true);
  assert.equal(maeIsBlackoutLocalTime(threeOhOne, zone), false);
});

test("Chicago 23:00 would display as NY 12:00 AM and is rejected as blackout in NY", () => {
  const chicagoLate = Date.parse("2026-10-09T04:00:00.000Z"); // 11 PM CDT / 12 AM EDT
  assert.equal(maeIsBlackoutLocalTime(chicagoLate, "America/New_York"), true);
  assert.equal(maeIsBlackoutLocalTime(chicagoLate, "America/Chicago"), true);
});

test("suggested map ignores industry 20:00 YouTube windows and uses MAE", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "YouTube", output_type: "Short", scheduled_at: "" },
      { platform: "Instagram", output_type: "Reel", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone },
  );
  const youtube = localParts(stamps.get("YouTube::Short"), zone);
  const instagram = localParts(stamps.get("Instagram::Reel"), zone);
  assert.equal(youtube.hour, 5);
  assert.equal(youtube.minute, 30);
  assert.equal(instagram.hour, 11);
  assert.equal(instagram.minute, 30);
  for (const iso of stamps.values()) {
    assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
  }
});

test("a new short spreads morning afternoon evening then next-day MAE, not a same-day 4th", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Instagram", output_type: "Reel", scheduled_at: "" },
      { platform: "Facebook", output_type: "Reel", scheduled_at: "" },
      { platform: "TikTok", output_type: "Video Draft", scheduled_at: "" },
      { platform: "YouTube", output_type: "Short", scheduled_at: "" },
    ],
    {},
    now,
    { timeZone: zone },
  );
  const clocks = ["Instagram::Reel", "Facebook::Reel", "TikTok::Video Draft", "YouTube::Short"]
    .map((key) => localParts(stamps.get(key), zone))
    .map((part) => `${part.hour}:${String(part.minute).padStart(2, "0")}`);
  assert.deepEqual(clocks, ["5:30", "11:30", "16:30", "5:30"]);
  assert.notEqual(dayOf(stamps.get("Instagram::Reel"), zone), dayOf(stamps.get("YouTube::Short"), zone));
});

test("Stories share MAE occupancy instead of resetting to the next slot today", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-07T12:00:00Z");
  const morning = maeZonedWallToUtcMs(2026, 10, 7, 5, 30, zone);
  const afternoon = maeZonedWallToUtcMs(2026, 10, 7, 11, 30, zone);
  const evening = maeZonedWallToUtcMs(2026, 10, 7, 16, 30, zone);
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Instagram", output_type: "Story", scheduled_at: "" },
      { platform: "Facebook", output_type: "Story", scheduled_at: "" },
    ],
    { Instagram: [morning, afternoon, evening], Facebook: [morning, afternoon, evening] },
    now,
    { timeZone: zone },
  );
  const ig = stamps.get("Instagram::Story");
  const fb = stamps.get("Facebook::Story");
  assert.ok(ig, "Instagram::Story");
  assert.ok(fb, "Facebook::Story");
  // Shared profile occupancy: once today's MAE is full, both Stories move to the next day
  // and take morning then afternoon (not two independent morning resets).
  assert.notEqual(dayOf(ig, zone), "2026-10-07");
  assert.notEqual(dayOf(fb, zone), "2026-10-07");
  assert.equal(dayOf(ig, zone), dayOf(fb, zone));
  assert.equal(localParts(ig, zone).hour, 5);
  assert.equal(localParts(ig, zone).minute, 30);
  assert.equal(localParts(fb, zone).hour, 11);
  assert.equal(localParts(fb, zone).minute, 30);
  assert.notEqual(ig, fb);
});

test("after 28 days of MAE are full, the 4th is day 1's largest gap", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 5 }, 28);
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Instagram", output_type: "Reel", scheduled_at: "" },
      { platform: "Facebook", output_type: "Reel", scheduled_at: "" },
    ],
    { Instagram: occupied.slice(), Facebook: occupied.slice() },
    now,
    { timeZone: zone },
  );
  const first = stamps.get("Instagram::Reel");
  const second = stamps.get("Facebook::Reel");
  assert.equal(dayOf(first, zone), "2026-10-05");
  assert.equal(localParts(first, zone).hour, 8);
  assert.equal(localParts(first, zone).minute, 30);
  assert.equal(dayOf(second, zone), "2026-10-06");
  assert.equal(localParts(second, zone).hour, 8);
  assert.equal(localParts(second, zone).minute, 30);
});

test("5th posts walk day 1 again after every day already has a 4th", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 3 }, 28);
  // Seed one 4th on every day (08:30 local).
  for (let offset = 0; offset < 28; offset++) {
    const utc = Date.UTC(2026, 9, 3 + offset);
    const d = new Date(utc);
    occupied.push(maeZonedWallToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 8, 30, zone));
  }
  const iso = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  assert.ok(iso);
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
  const local = localParts(iso, zone);
  // 5th is a widest-gap slot, not another MAE day-part.
  assert.ok(!(local.hour === 5 && local.minute === 30));
  assert.ok(!(local.hour === 11 && local.minute === 30));
  assert.ok(!(local.hour === 16 && local.minute === 30));
  // Walk starts at day 1; first day that still has room wins (may skip crowded early days).
  assert.ok(dayOf(iso, zone) >= "2026-10-03");
  assert.ok(dayOf(iso, zone) <= "2026-10-30");
});

test("extras fill day 1's gap before day 2's gap once MAE horizon is full", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, { year: 2026, month: 10, day: 3 }, 28);
  const first = maePickBalancedSuggestedIso([], now, { timeZone: zone, occupiedMs: occupied });
  const firstLocal = localParts(first, zone);
  assert.equal(dayOf(first, zone), "2026-10-03");
  assert.equal(firstLocal.hour, 8);
  assert.equal(firstLocal.minute, 30);

  const second = maePickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: [...occupied, Date.parse(first)],
  });
  const secondLocal = localParts(second, zone);
  assert.equal(dayOf(second, zone), "2026-10-04");
  assert.equal(secondLocal.hour, 8);
  assert.equal(secondLocal.minute, 30);
});

test("existing blackout stamps are not reused", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const stamps = maeBuildSuggestedScheduleMap(
    [{ platform: "YouTube", output_type: "Short", scheduled_at: "2026-10-09T04:00:00.000Z" }],
    {},
    now,
    { timeZone: zone },
  );
  const iso = stamps.get("YouTube::Short");
  assert.notEqual(iso, "2026-10-09T04:00:00.000Z");
  assert.equal(maeIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("a taken 5:30 is not reused; the next MAE opening is chosen", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const morning = maePickBalancedSuggestedIso([], now, {
    occupiedMs: [],
    platformOccupiedMs: [],
    timeZone: zone,
  });
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Instagram", output_type: "Reel", scheduled_at: morning },
      { platform: "Instagram", output_type: "Carousel", scheduled_at: morning },
    ],
    { Instagram: [Date.parse(morning)] },
    now,
    { timeZone: zone },
  );
  const reel = localParts(stamps.get("Instagram::Reel"), zone);
  const carousel = localParts(stamps.get("Instagram::Carousel"), zone);
  assert.notEqual(stamps.get("Instagram::Reel"), morning);
  assert.equal(reel.hour, 11);
  assert.equal(reel.minute, 30);
  assert.equal(carousel.hour, 16);
  assert.equal(carousel.minute, 30);
  assert.equal(dayOf(stamps.get("Instagram::Reel"), zone), dayOf(morning, zone));
});

test("two Instagrams stored on the same free 5:30 become morning then afternoon", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-05T08:00:00Z");
  const morning = maePickBalancedSuggestedIso([], now, {
    occupiedMs: [],
    platformOccupiedMs: [],
    timeZone: zone,
  });
  const stamps = maeBuildSuggestedScheduleMap(
    [
      { platform: "Instagram", output_type: "Reel", scheduled_at: morning },
      { platform: "Instagram", output_type: "Carousel", scheduled_at: morning },
    ],
    {},
    now,
    { timeZone: zone },
  );
  const reel = localParts(stamps.get("Instagram::Reel"), zone);
  const carousel = localParts(stamps.get("Instagram::Carousel"), zone);
  assert.equal(stamps.get("Instagram::Reel"), new Date(morning).toISOString());
  assert.equal(reel.hour, 5);
  assert.equal(reel.minute, 30);
  assert.equal(carousel.hour, 11);
  assert.equal(carousel.minute, 30);
});

test("occupancy load windows the Airtable query and sorts nearest-first", () => {
  const loadFn = worker.slice(
    worker.indexOf("async function studioLoadOccupiedScheduleRows"),
    worker.indexOf("async function studioLoadOccupiedSchedules"),
  );
  assert.match(loadFn, /sortDirection: "asc"/);
  assert.doesNotMatch(loadFn, /sortDirection: "desc"/);
  assert.match(loadFn, /studioOccupiedFilterFormula\(now, profile\)/);
  assert.match(loadFn, /"Studio_Output_Type"/);
  assert.match(loadFn, /"Format"/);
  assert.match(loadFn, /"Content_Profile"/);
  assert.doesNotMatch(loadFn, /"Brand"/);
  assert.match(loadFn, /occupied schedule occupancy read failed/);
  assert.match(worker, /function studioOccupiedFilterFormula/);
  assert.match(worker, /contentProfileFilterFormula\(profile\)/);
  assert.match(worker, /studioOccupiedRowMatchesProfile/);
  assert.match(worker, /studioOccupiedCacheKey/);
  assert.match(worker, /IS_AFTER\(\{\$\{field\}\},DATETIME_PARSE/);
  assert.match(worker, /IS_BEFORE\(\{\$\{field\}\},DATETIME_PARSE/);
  assert.match(worker, /"Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At"/);
  assert.doesNotMatch(worker, /const STUDIO_OCCUPIED_FORMULA =/);
});

test("Worker stamp paths use MAE not industry evening windows", () => {
  assert.match(worker, /from "\.\/mae-schedule\.mjs"/);
  assert.match(worker, /studio_mae_schedule_v1: true/);
  assert.match(worker, /studio_mae_profile_occupancy_v1: true/);
  assert.match(worker, /studio_schedule_occupancy_fields_v1: true/);
  assert.match(worker, /0.10.526-pipeline-review-filter/);
  assert.match(worker, /STUDIO_OCCUPIED_HORIZON_MS = 28 \* 24/);
  assert.match(worker, /studioLoadPlanScheduleOccupancy/);
  assert.match(worker, /A stored 5:30 that lost its slot must be written/);
  assert.match(worker, /MAE_PRIORITY_SCHEDULE_WINDOWS/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("function studioBuildSuggestedScheduleMap")),
    /studioIndustryBestWindows\(platform, outputType\);\s*const iso = studioPickBalancedSuggestedIso\(industry\.windows/,
  );
  assert.match(worker, /maeIsBlackoutLocalTime\(existingMs, timeZone\)/);
});

test("1 AM NYC still picks today's 5:30, not tomorrow morning", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T05:58:00Z");
  const iso = maePickBalancedSuggestedIso([], now, { occupiedMs: [], timeZone: zone });
  assert.equal(dayOf(iso, zone), "2026-10-06");
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
});

test("Chicago occupancy for today does not move an empty NYC calendar to tomorrow morning", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T14:00:00Z"); // 10:00 AM EDT, so 5:30 is past
  const iso = maePickBalancedSuggestedIso([], now, { occupiedMs: [], timeZone: zone });
  assert.equal(dayOf(iso, zone), "2026-10-06");
  const local = localParts(iso, zone);
  assert.equal(local.hour, 11);
  assert.equal(local.minute, 30);
});
