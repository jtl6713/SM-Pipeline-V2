import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.window = globalThis;
await import("./assets/ez-plan.js");
const plan = globalThis.ChicagoShiningEzPlan;

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

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

function wallMs(year, month, day, hour, minute, timeZone) {
  const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ms = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
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

function fillMaeHorizon(zone, year, month, day, days = 28) {
  const occupied = [];
  for (let offset = 0; offset < days; offset++) {
    const utc = Date.UTC(year, month - 1, day) + offset * 86400000;
    const d = new Date(utc);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    for (const [hh, mm] of [[5, 30], [11, 30], [16, 30]]) {
      occupied.push(wallMs(y, m, dd, hh, mm, zone));
    }
  }
  return occupied;
}

test("automatic suggestions use the first-priority morning window in each profile timezone", () => {
  const now = new Date("2026-10-03T08:00:00Z");
  for (const timeZone of ["America/Chicago", "America/New_York", "America/Los_Angeles"]) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone });
    const local = localParts(iso, timeZone);
    assert.equal(local.hour, 5);
    assert.equal(local.minute, 30);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), timeZone), false);
  }
});

test("scheduler fills same-day afternoon after morning, then evening, then next-day MAE", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [wallMs(2026, 10, 3, 5, 30, zone)];
  const midday = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.deepEqual(localParts(midday, zone), { hour: 11, minute: 30 });

  occupied.push(Date.parse(midday));
  const afternoon = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: occupied,
  });
  assert.deepEqual(localParts(afternoon, zone), { hour: 16, minute: 30 });

  occupied.push(Date.parse(afternoon));
  const nextMorning = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: occupied,
  });
  assert.equal(dayOf(nextMorning, zone), "2026-10-04");
  assert.deepEqual(localParts(nextMorning, zone), { hour: 5, minute: 30 });
});

test("once the 28-day MAE horizon is covered, the extra is day 1's largest gap", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, 2026, 10, 3, 28);
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.equal(dayOf(iso, zone), "2026-10-03");
  assert.deepEqual(localParts(iso, zone), { hour: 8, minute: 30 });

  const next = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: [...occupied, Date.parse(iso)],
  });
  assert.equal(dayOf(next, zone), "2026-10-04");
  assert.deepEqual(localParts(next, zone), { hour: 8, minute: 30 });
});

test("11 PM through 3:00 AM is a blackout in profile local time", () => {
  const zone = "America/New_York";
  const samples = [
    [wallMs(2026, 10, 3, 23, 0, zone), true],   // 11:00 PM
    [wallMs(2026, 10, 4, 3, 0, zone), true],    // 3:00 AM
    [wallMs(2026, 10, 4, 3, 1, zone), false],   // 3:01 AM
    [wallMs(2026, 10, 3, 22, 59, zone), false], // 10:59 PM
    [wallMs(2026, 10, 3, 20, 0, zone), false],  // 8:00 PM is now allowed
  ];
  for (const [ms, expected] of samples) {
    assert.equal(plan.ezIsBlackoutLocalTime(ms, zone), expected, new Date(ms).toISOString());
  }
});

test("conflict fallback re-picks MAE instead of walking into overnight blackout", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-03T12:00:00Z"); // 5:00 AM PDT, 5:30 still open
  const candidate = "2026-10-04T07:00:00Z"; // midnight PDT — blackout
  const occupied = [Date.parse(candidate)];
  const iso = plan.ezNextOpenScheduleIso(candidate, occupied, 3 * 60 * 60 * 1000, { timeZone: zone, now });
  const local = localParts(iso, zone);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("scheduler uses same-day afternoon when morning is taken, not a second morning", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [wallMs(2026, 10, 3, 5, 30, zone)];
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.equal(dayOf(iso, zone), "2026-10-03");
  assert.deepEqual(localParts(iso, zone), { hour: 11, minute: 30 });
});

test("another platform's morning pushes this post to the same-day afternoon", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupiedMs = [wallMs(2026, 10, 3, 5, 30, zone)];
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs,
    platformOccupiedMs: [],
  });
  assert.equal(dayOf(iso, zone), "2026-10-03");
  assert.deepEqual(localParts(iso, zone), { hour: 11, minute: 30 });
});

test("earlier day wins when days have equal profile load", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: [],
    platformOccupiedMs: [],
  });
  assert.equal(dayOf(iso, zone), "2026-10-03");
});

test("widest-gap fallback never schedules beyond the rolling 28-day horizon", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, 2026, 10, 3, 28);
  for (let offset = 0; offset < 28; offset++) {
    const utc = Date.UTC(2026, 9, 3 + offset);
    const d = new Date(utc);
    occupied.push(wallMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 8, 30, zone));
    occupied.push(wallMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 14, 0, zone));
  }
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  if (iso) {
    const horizonEnd = wallMs(2026, 10, 31, 23, 0, zone);
    assert.ok(Date.parse(iso) < horizonEnd, iso);
  }
});

test("initial suggested schedule map honors the active Los Angeles profile timezone", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T06:00:00Z"); // 11 PM on Oct 3 in Los Angeles
  const items = ["Photo", "Reel", "Story"].map((output_type) => ({ platform: "Facebook", output_type, scheduled_at: "" }));
  const schedules = plan.ezBuildSuggestedScheduleMap(items, {}, now, { timeZone: zone });
  const values = [...schedules.values()];
  assert.equal(values.length, items.length);
  for (const iso of values) {
    const date = dayOf(iso, zone);
    const local = localParts(iso, zone);
    assert.ok(date >= "2026-10-03" && date < "2026-11-01", `outside 28-day profile horizon: ${iso} (${date})`);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
    assert.ok(local.hour === 5 || local.hour === 11, `unexpected hour ${local.hour} for ${iso}`);
    if (local.hour === 5) assert.equal(local.minute, 30);
  }
  const photo = Date.parse(schedules.get("Facebook::Photo"));
  const reel = Date.parse(schedules.get("Facebook::Reel"));
  const story = Date.parse(schedules.get("Facebook::Story"));
  assert.ok(Math.abs(photo - reel) >= 3 * 60 * 60 * 1000);
  assert.equal(localParts(schedules.get("Facebook::Photo"), zone).hour, 5);
  assert.equal(localParts(schedules.get("Facebook::Reel"), zone).hour, 11);
  assert.equal(story, photo);
});

test("Facebook and Instagram Stories may share a slot; other types share a platform lane", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T12:00:00Z");
  const fb = plan.ezBuildSuggestedScheduleMap(
    ["Reel", "Story"].map((output_type) => ({ platform: "Facebook", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  assert.equal(Date.parse(fb.get("Facebook::Story")), Date.parse(fb.get("Facebook::Reel")));

  const ig = plan.ezBuildSuggestedScheduleMap(
    ["Carousel", "Story"].map((output_type) => ({ platform: "Instagram", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  assert.equal(Date.parse(ig.get("Instagram::Story")), Date.parse(ig.get("Instagram::Carousel")));

  const tt = plan.ezBuildSuggestedScheduleMap(
    ["Video Draft", "Multi-Photo"].map((output_type) => ({ platform: "TikTok", output_type, scheduled_at: "" })),
    {},
    now,
    { timeZone: zone },
  );
  assert.deepEqual(localParts(tt.get("TikTok::Video Draft"), zone), { hour: 11, minute: 30 });
  assert.deepEqual(localParts(tt.get("TikTok::Multi-Photo"), zone), { hour: 16, minute: 30 });
});

test("existing automatic schedule inside LA blackout is replaced using LA profile time", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-04T17:00:00Z");
  const items = [{
    platform: "Facebook",
    output_type: "Story",
    scheduled_at: "2026-10-09T09:00:00.000Z", // 2:00 AM PDT — forbidden in LA.
  }];
  const schedules = plan.ezBuildSuggestedScheduleMap(items, {}, now, { timeZone: zone });
  const iso = schedules.get("Facebook::Story");
  assert.ok(iso);
  assert.notEqual(iso, items[0].scheduled_at);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
});

test("picker fills morning then afternoon then evening before the next day", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-04T08:00:00Z");
  const occupied = [];
  const picks = [];
  for (let i = 0; i < 4; i++) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, {
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
      timeZone: zone,
    });
    picks.push(iso);
    occupied.push(Date.parse(iso));
  }
  const local = picks.map((iso) => new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso)));
  assert.deepEqual(local.slice(0, 3), ["05:30", "11:30", "16:30"]);
  assert.equal(local[3], "05:30");
  assert.notEqual(dayOf(picks[3], zone), dayOf(picks[0], zone));
  assert.ok(picks.every((iso) => !plan.ezIsBlackoutLocalTime(Date.parse(iso), zone)));
});

test("Studio calendars and blackout checks use the selected profile timezone", () => {
  assert.match(app, /function workingStudioTimeZone\(\)/);
  assert.match(app, /return studioTimezone\(\)/);
  assert.match(app, /pipelineScheduleIsBlackout\(iso, workingStudioTimeZone\(\)\)/);
  assert.match(app, /helper\.sevenDayWindow\(anchor, workingStudioTimeZone\(\)\)/);
  assert.match(app, /helper\.sevenDayWindow\(new Date\(\), workingStudioTimeZone\(\)\)/);
  assert.match(app, /localMinutes >= 23 \* 60 \|\| localMinutes <= 3 \* 60/);
  assert.match(app, /11:00 PM–3:00 AM local/);
  assert.match(app, /next 28 days/);
  assert.match(html, /11:00 PM–3:00 AM local/);
  assert.match(html, /selected content profile timezone/);
});
