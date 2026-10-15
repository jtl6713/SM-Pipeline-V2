import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window = globalThis;
await import("./assets/ez-plan.js");
const plan = globalThis.ChicagoShiningEzPlan;
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

function localParts(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

test("Approve path keeps a saved non-clashing time (Output 1790 style)", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T18:00:00Z");
  const saved = "2026-10-19T18:30:00.000Z"; // Oct 19 2:30 PM EDT (inside open hours)
  const kept = plan.ezNextOpenScheduleIso(saved, [], 90 * 60 * 1000, {
    timeZone: zone,
    now,
    keepAnyNonClashing: true,
  });
  assert.equal(kept, new Date(saved).toISOString());
  const local = localParts(kept, zone);
  assert.equal(local.month, 10);
  assert.equal(local.day, 19);
  assert.equal(local.hour, 14);
  assert.equal(local.minute, 30);
});

test("day with MAE taken opens the next day morning", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T18:00:00Z"); // 2:00 PM EDT
  const occupied = [
    Date.parse("2026-10-06T09:00:00.000Z"), // 5:00 AM
    Date.parse("2026-10-06T14:30:00.000Z"), // 10:30 AM
    Date.parse("2026-10-06T20:00:00.000Z"), // 4:00 PM
  ];
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  const local = localParts(iso, zone);
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
  assert.equal(local.month, 10);
  assert.equal(local.day, 7);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 0);
});

test("same-platform posts stay at least 90 minutes apart", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T08:00:00Z");
  const occupied = [];
  const stamps = [];
  for (let i = 0; i < 6; i++) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
    });
    stamps.push(Date.parse(iso));
    occupied.push(Date.parse(iso));
  }
  for (let i = 1; i < stamps.length; i++) {
    assert.ok(Math.abs(stamps[i] - stamps[i - 1]) >= 90 * 60 * 1000 - 1000);
  }
});

test("Pipeline paints Will be scheduled on approval instead of binding a stale time", () => {
  assert.match(app, /Will be scheduled on approval/);
  assert.match(app, /Do not bind a suggested time before approval/);
});
