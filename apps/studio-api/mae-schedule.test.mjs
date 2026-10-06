import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAE_PRIORITY_SCHEDULE_WINDOWS,
  maeBuildSuggestedScheduleMap,
  maeIsBlackoutLocalTime,
  maeNextOpenScheduleIso,
  maePickBalancedSuggestedIso,
  maeTimeZoneFromTheme,
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

test("nyc and miami map to America/New_York", () => {
  assert.equal(maeTimeZoneFromTheme("nyc"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("miami"), "America/New_York");
  assert.equal(maeTimeZoneFromTheme("la"), "America/Los_Angeles");
});

test("MAE never stamps NYC midnight or 1 AM for YouTube/Instagram", () => {
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
  assert.ok(!hours.includes(0) && !hours.includes(1) && !hours.includes(20) && !hours.includes(23), hours.join(","));
});

test("Worker MAE fills morning then afternoon then evening on the same day", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const occupied = [];
  const locals = [];
  for (let i = 0; i < 4; i++) {
    const iso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    locals.push(localParts(iso, zone));
    occupied.push(Date.parse(iso));
  }
  assert.deepEqual(locals.slice(0, 3).map((part) => `${part.hour}:${String(part.minute).padStart(2, "0")}`), [
    "5:30",
    "11:30",
    "16:30",
  ]);
  assert.equal(locals[3].hour, 5);
  assert.equal(locals[3].minute, 30);
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
  const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  assert.equal(first.hour, 5);
  assert.equal(first.minute, 30);
  assert.equal(second.hour, 11);
  assert.equal(second.minute, 30);
  assert.equal(dayOf(stamps.get("TikTok::Video Draft")), dayOf(stamps.get("TikTok::Multi-Photo")));
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

test("a new short spreads morning afternoon evening instead of four mornings", () => {
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
  const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
  assert.equal(dayOf(stamps.get("Instagram::Reel")), dayOf(stamps.get("Facebook::Reel")));
  assert.notEqual(dayOf(stamps.get("Instagram::Reel")), dayOf(stamps.get("YouTube::Short")));
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
  const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
  assert.equal(dayOf(stamps.get("Instagram::Reel")), dayOf(morning));
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
  assert.match(loadFn, /studioOccupiedFilterFormula\(now\)/);
  assert.match(loadFn, /"Studio_Output_Type"/);
  assert.match(loadFn, /"Format"/);
  assert.match(worker, /function studioOccupiedFilterFormula/);
  assert.match(worker, /IS_AFTER\(\{\$\{field\}\},DATETIME_PARSE/);
  assert.match(worker, /IS_BEFORE\(\{\$\{field\}\},DATETIME_PARSE/);
  assert.match(worker, /"Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At"/);
  assert.doesNotMatch(worker, /const STUDIO_OCCUPIED_FORMULA =/);
});

test("Worker stamp paths use MAE not industry evening windows", () => {
  assert.match(worker, /from "\.\/mae-schedule\.mjs"/);
  assert.match(worker, /studio_mae_schedule_v1: true/);
  assert.match(worker, /0\.10\.453-mae-across-platforms/);
  assert.match(worker, /studioLoadPlanScheduleOccupancy/);
  assert.match(worker, /A stored 5:30 that lost its slot must be written/);
  assert.match(worker, /MAE_PRIORITY_SCHEDULE_WINDOWS/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("function studioBuildSuggestedScheduleMap")),
    /studioIndustryBestWindows\(platform, outputType\);\s*const iso = studioPickBalancedSuggestedIso\(industry\.windows/,
  );
  assert.match(worker, /maeIsBlackoutLocalTime\(existingMs, timeZone\)/);
});
