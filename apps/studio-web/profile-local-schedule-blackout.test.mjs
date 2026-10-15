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

function fillMaeHorizon(zone, year, month, day, days = 30) {
  const occupied = [];
  for (let offset = 0; offset < days; offset++) {
    const utc = Date.UTC(year, month - 1, day) + offset * 86400000;
    const d = new Date(utc);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    for (const [hh, mm] of [[5, 0], [10, 30], [16, 0]]) {
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
    assert.equal(local.minute, 0);
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), timeZone), false);
  }
});

test("scheduler fills Day 1 MAE before moving to Day 2", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = [];
  const first = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.deepEqual(localParts(first, zone), { hour: 5, minute: 0 });
  occupied.push(Date.parse(first));
  const second = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.equal(dayOf(second, zone), "2026-10-03");
  assert.deepEqual(localParts(second, zone), { hour: 10, minute: 30 });
  occupied.push(Date.parse(second));
  const third = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.deepEqual(localParts(third, zone), { hour: 16, minute: 0 });
  occupied.push(Date.parse(third));
  const fourth = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.equal(dayOf(fourth, zone), "2026-10-04");
  assert.deepEqual(localParts(fourth, zone), { hour: 5, minute: 0 });
});

test("once the 30-day MAE horizon is covered, the extra is day 1's largest gap", () => {
  const zone = "America/Chicago";
  const now = new Date("2026-10-03T08:00:00Z");
  const occupied = fillMaeHorizon(zone, 2026, 10, 3, 30);
  const iso = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone, platformOccupiedMs: occupied });
  assert.equal(dayOf(iso, zone), "2026-10-03");
  const local = localParts(iso, zone);
  assert.ok(!(local.hour === 5 && local.minute === 0));
  assert.ok(!(local.hour === 10 && local.minute === 30));
  assert.ok(!(local.hour === 16 && local.minute === 0));

  const next = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: [...occupied, Date.parse(iso)],
  });
  assert.equal(dayOf(next, zone), "2026-10-04");
});

test("8:00 PM profile local is blackout; 7:59 PM is not", () => {
  const zone = "America/Los_Angeles";
  assert.equal(plan.ezIsBlackoutLocalTime(wallMs(2026, 10, 8, 20, 0, zone), zone), true);
  assert.equal(plan.ezIsBlackoutLocalTime(wallMs(2026, 10, 8, 19, 59, zone), zone), false);
  assert.equal(plan.ezIsBlackoutLocalTime(wallMs(2026, 10, 9, 3, 30, zone), zone), true);
  assert.equal(plan.ezIsBlackoutLocalTime(wallMs(2026, 10, 9, 3, 31, zone), zone), false);
});

test("widest-gap fallback never schedules beyond the rolling 30-day horizon", () => {
  const zone = "America/Los_Angeles";
  const now = new Date("2026-10-03T12:00:00Z");
  const occupied = fillMaeHorizon(zone, 2026, 10, 3, 30);
  for (let i = 0; i < 5; i++) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, {
      timeZone: zone,
      platformOccupiedMs: occupied,
      horizonDays: 30,
    });
    assert.ok(iso);
    occupied.push(Date.parse(iso));
    const date = dayOf(iso, zone);
    assert.ok(date >= "2026-10-03" && date <= "2026-11-01", `outside 30-day profile horizon: ${iso} (${date})`);
  }
});

test("Facebook Reel and Story use independent lanes", () => {
  assert.equal(plan.ezScheduleLaneKey("Facebook", "Reel"), "facebook::reel");
  assert.equal(plan.ezScheduleLaneKey("Facebook", "Story"), "facebook::story");
  assert.match(app, /Independent lane per platform/);
  assert.match(app, /Will be scheduled on approval/);
  assert.match(html, /Scheduling Horizon \(Days\)/);
  assert.equal(plan.EZ_SUGGEST_HORIZON_DAYS, 30);
});
