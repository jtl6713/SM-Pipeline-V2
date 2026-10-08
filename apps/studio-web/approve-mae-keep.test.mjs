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
  const saved = "2026-10-19T20:30:00.000Z"; // Oct 19 4:30 PM EDT
  const kept = plan.ezNextOpenScheduleIso(saved, [], 3 * 60 * 60 * 1000, {
    timeZone: zone,
    now,
    keepAnyNonClashing: true,
  });
  assert.equal(kept, new Date(saved).toISOString());
  const local = localParts(kept, zone);
  assert.equal(local.month, 10);
  assert.equal(local.day, 19);
  assert.equal(local.hour, 16);
  assert.equal(local.minute, 30);
});

test("day with four posts skips a taken evening and opens the next MAE slot (Output 1809 style)", () => {
  const zone = "America/New_York";
  // Afternoon on Oct 6: morning/afternoon/evening already have posts, plus one more morning next day.
  const now = new Date("2026-10-06T18:00:00Z"); // 2:00 PM EDT — morning+afternoon already past
  const occupied = [
    Date.parse("2026-10-06T09:30:00.000Z"), // 5:30 AM
    Date.parse("2026-10-06T15:30:00.000Z"), // 11:30 AM
    Date.parse("2026-10-06T20:30:00.000Z"), // 4:30 PM
    Date.parse("2026-10-06T21:00:00.000Z"), // another evening-adjacent post
  ];
  const iso = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    occupiedMs: occupied,
    platformOccupiedMs: occupied,
  });
  const local = localParts(iso, zone);
  // Must not stay on Oct 6 4:30 PM when that slot is taken.
  assert.notEqual(`${local.month}-${local.day} ${local.hour}:${local.minute}`, "10-6 16:30");
  assert.ok(
    (local.hour === 5 && local.minute === 30)
    || (local.hour === 11 && local.minute === 30)
    || (local.hour === 16 && local.minute === 30),
    `off MAE: ${iso}`,
  );
  assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false);
  // With today M/A/E taken after 2 PM, next open is Oct 7 morning.
  assert.equal(local.month, 10);
  assert.equal(local.day, 7);
  assert.equal(local.hour, 5);
  assert.equal(local.minute, 30);
});

test("same-platform posts stay at least 3 hours apart", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T12:00:00Z");
  const first = plan.ezPickBalancedSuggestedIso([], now, { timeZone: zone });
  const second = plan.ezPickBalancedSuggestedIso([], now, {
    timeZone: zone,
    platformOccupiedMs: [Date.parse(first)],
    occupiedMs: [Date.parse(first)],
  });
  assert.ok(Math.abs(Date.parse(second) - Date.parse(first)) >= 3 * 60 * 60 * 1000);
});

test("MAE never returns overnight blackout slots", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-06T12:00:00Z");
  const occupied = [];
  for (let i = 0; i < 9; i++) {
    const iso = plan.ezPickBalancedSuggestedIso([], now, {
      timeZone: zone,
      occupiedMs: occupied,
      platformOccupiedMs: occupied,
    });
    assert.equal(plan.ezIsBlackoutLocalTime(Date.parse(iso), zone), false, iso);
    occupied.push(Date.parse(iso));
  }
});

test("UI Approve uses candidate-aware next-open and never silent-fails", () => {
  assert.match(app, /ezNextOpenScheduleIso/);
  assert.match(app, /keepAnyNonClashing/);
  assert.match(app, /pipelineMergedOccupancy/);
  assert.match(app, /pipelineApproveBlockedMessage/);
  assert.match(app, /Save the edited schedule time before approving this content/);
  assert.match(app, /No outputs in this content item are waiting for approval/);
  assert.match(app, /Approve content failed before confirm/);
  // Regression: the first runtime helper call must be candidate-aware, not bare MAE.
  const nextOpen = app.slice(app.indexOf("function nextOpenScheduleIso"), app.indexOf("function pipelineMergedOccupancy"));
  const firstHelperCall = nextOpen.search(/helper\?\.ez(?:NextOpenScheduleIso|PickBalancedSuggestedIso)/);
  assert.ok(firstHelperCall >= 0, "nextOpenScheduleIso must call an EZ helper");
  assert.match(nextOpen.slice(firstHelperCall, firstHelperCall + 40), /ezNextOpenScheduleIso/);
});
